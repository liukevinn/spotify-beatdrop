import { beforeEach, describe, expect, it, vi } from "vitest";
import { cueNextSet } from "@/lib/services/cue";
import { markDrop, nudgeLastCued } from "@/lib/services/drops";
import type { Drop, Settings } from "@/lib/types";

vi.mock("@/lib/db/drops", () => ({
  listDrops: vi.fn(),
  saveMarkedDrop: vi.fn(),
  getDropOrThrow: vi.fn(),
  updateDrop: vi.fn(),
}));
vi.mock("@/lib/db/settings", () => ({ getSettings: vi.fn() }));
vi.mock("@/lib/db/sets", () => ({ listSets: vi.fn(), getLatestSet: vi.fn(), insertSet: vi.fn() }));
vi.mock("@/lib/spotify/playback", () => ({ playOnDevice: vi.fn() }));
vi.mock("@/lib/spotify/client", () => ({ getCurrentlyPlaying: vi.fn() }));

const dropsDb = await import("@/lib/db/drops");
const settingsDb = await import("@/lib/db/settings");
const setsDb = await import("@/lib/db/sets");
const playback = await import("@/lib/spotify/playback");
const spotify = await import("@/lib/spotify/client");

const settings: Settings = {
  leadMs: 20000,
  reactionOffsetMs: 250,
  queueMode: "sequential",
  avoidRepeatWithin: 5,
  deviceId: "phone",
  deviceName: "iPhone",
};

function drop(overrides: Partial<Drop> = {}): Drop {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    trackId: "t1",
    trackUri: "spotify:track:t1",
    trackName: "Early Drop",
    artists: "Artist",
    albumArtUrl: null,
    durationMs: 180000,
    dropMs: 12000,
    leadMsOverride: null,
    enabled: true,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(settingsDb.getSettings).mockResolvedValue(settings);
  vi.mocked(setsDb.listSets).mockResolvedValue([]);
  vi.mocked(setsDb.getLatestSet).mockResolvedValue(null);
  vi.mocked(setsDb.insertSet).mockImplementation(async (_userId, s) => ({
    ...s,
    id: "set-1",
    cuedAt: "2026-01-01T00:00:00Z",
  }));
});

describe("cueNextSet", () => {
  it("plays at drop - lead, logs the set, and reports the actual lead", async () => {
    vi.mocked(dropsDb.listDrops).mockResolvedValue([drop()]);
    const result = await cueNextSet("u1", { source: "shortcut" });

    expect(playback.playOnDevice).toHaveBeenCalledWith("u1", { uri: "spotify:track:t1", name: "Early Drop" }, 0);
    expect(setsDb.insertSet).toHaveBeenCalledWith("u1", expect.objectContaining({ positionMs: 0, leadMs: 12000, source: "shortcut" }));
    expect(result.message).toBe("▶ Early Drop — drop in 12s");
    expect(result.leadMs).toBe(12000);
  });

  it("throws NO_DROPS when nothing is enabled", async () => {
    vi.mocked(dropsDb.listDrops).mockResolvedValue([]);
    await expect(cueNextSet("u1", { source: "pwa" })).rejects.toMatchObject({ code: "NO_DROPS", status: 409 });
    expect(playback.playOnDevice).not.toHaveBeenCalled();
  });

  it("doesn't log a set when playback fails", async () => {
    vi.mocked(dropsDb.listDrops).mockResolvedValue([drop({ dropMs: 90000 })]);
    vi.mocked(playback.playOnDevice).mockRejectedValueOnce(new Error("boom"));
    await expect(cueNextSet("u1", { source: "pwa" })).rejects.toThrow("boom");
    expect(setsDb.insertSet).not.toHaveBeenCalled();
  });
});

describe("markDrop", () => {
  const playing = {
    kind: "track" as const,
    progressMs: 83662,
    isPlaying: true,
    track: { id: "t1", uri: "spotify:track:t1", name: "Song", artists: "A", albumArtUrl: null, durationMs: 200000 },
  };

  it("saves progress minus the reaction offset", async () => {
    vi.mocked(spotify.getCurrentlyPlaying).mockResolvedValue(playing);
    vi.mocked(dropsDb.saveMarkedDrop).mockResolvedValue({ drop: drop({ trackName: "Song", dropMs: 83412 }), created: true });

    const result = await markDrop("u1");
    expect(dropsDb.saveMarkedDrop).toHaveBeenCalledWith("u1", playing.track, 83412);
    expect(result.message).toBe("Marked drop for Song at 1:23.4");
  });

  it("honours an explicit reaction offset", async () => {
    vi.mocked(spotify.getCurrentlyPlaying).mockResolvedValue(playing);
    vi.mocked(dropsDb.saveMarkedDrop).mockResolvedValue({ drop: drop(), created: false });
    await markDrop("u1", { reactionOffsetMs: 0 });
    expect(dropsDb.saveMarkedDrop).toHaveBeenCalledWith("u1", playing.track, 83662);
  });

  it("rejects when nothing or a local file is playing", async () => {
    vi.mocked(spotify.getCurrentlyPlaying).mockResolvedValueOnce({ kind: "nothing" });
    await expect(markDrop("u1")).rejects.toMatchObject({ code: "NOTHING_PLAYING" });
    vi.mocked(spotify.getCurrentlyPlaying).mockResolvedValueOnce({ kind: "local", name: "x" });
    await expect(markDrop("u1")).rejects.toMatchObject({ code: "UNSUPPORTED_TRACK" });
  });
});

describe("nudgeLastCued", () => {
  it("nudges the most recent set's drop", async () => {
    vi.mocked(setsDb.getLatestSet).mockResolvedValue({
      id: "s1",
      dropId: drop().id,
      trackId: "t1",
      trackName: "Early Drop",
      cuedAt: "2026-01-01T00:00:00Z",
      positionMs: 0,
      leadMs: 12000,
      source: "pwa",
    });
    vi.mocked(dropsDb.getDropOrThrow).mockResolvedValue(drop());
    vi.mocked(dropsDb.updateDrop).mockImplementation(async (_u, _id, patch) => drop({ dropMs: patch.dropMs }));

    const result = await nudgeLastCued("u1", 1000);
    expect(dropsDb.updateDrop).toHaveBeenCalledWith("u1", drop().id, { dropMs: 13000 });
    expect(result.message).toBe("Adjusted Early Drop to 0:13.0");
  });

  it("fails with NO_SETS before any cue", async () => {
    await expect(nudgeLastCued("u1", 250)).rejects.toMatchObject({ code: "NO_SETS" });
  });
});
