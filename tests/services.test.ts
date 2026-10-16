import { beforeEach, describe, expect, it, vi } from "vitest";
import { cueNextSet } from "@/lib/services/cue";
import { markDrop, nudgeLastCued } from "@/lib/services/drops";
import { performCut, startRest, swapRest, type PendingCut } from "@/lib/services/rest";
import type { Drop, Settings } from "@/lib/types";

vi.mock("@/lib/db/drops", () => ({
  listDrops: vi.fn(),
  saveMarkedDrop: vi.fn(),
  getDropOrThrow: vi.fn(),
  updateDrop: vi.fn(),
}));
vi.mock("@/lib/db/settings", () => ({ getSettings: vi.fn(), updateSettings: vi.fn() }));
vi.mock("@/lib/db/users", () => ({ getUserById: vi.fn() }));
vi.mock("@/lib/db/sets", () => ({
  listSets: vi.fn(),
  getLatestSet: vi.fn(),
  insertSet: vi.fn(),
  updateSetDrop: vi.fn(),
}));
vi.mock("@/lib/spotify/playback", () => ({ playOnDevice: vi.fn(), playQueueOnDevice: vi.fn() }));
vi.mock("@/lib/spotify/client", () => ({
  getCurrentlyPlaying: vi.fn(),
  getLikedFillers: vi.fn(),
  getPlaylistFillers: vi.fn(),
}));

const dropsDb = await import("@/lib/db/drops");
const settingsDb = await import("@/lib/db/settings");
const setsDb = await import("@/lib/db/sets");
const playback = await import("@/lib/spotify/playback");
const spotify = await import("@/lib/spotify/client");
const usersDb = await import("@/lib/db/users");

const settings: Settings = {
  leadMs: 20000,
  queueMode: "sequential",
  avoidRepeatWithin: 5,
  deviceId: "phone",
  deviceName: "iPhone",
  restMs: 210000,
  restSource: null,
  nextDropId: null,
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

    const [, queue, position] = vi.mocked(playback.playQueueOnDevice).mock.calls[0]!;
    expect(queue).toEqual({ uris: ["spotify:track:t1"], name: "Early Drop" });
    expect(position()).toBe(0);
    expect(setsDb.insertSet).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ positionMs: 0, leadMs: 12000, source: "shortcut" }),
    );
    expect(result.message).toBe("▶ Early Drop — drop in 12s");
    expect(result.leadMs).toBe(12000);
  });

  it("queues backup music behind the drop song so music keeps going into the next rest", async () => {
    const other = drop({ id: "66666666-6666-4666-8666-666666666666", trackId: "t6", trackUri: "spotify:track:t6" });
    vi.mocked(dropsDb.listDrops).mockResolvedValue([drop(), other]);
    vi.mocked(settingsDb.getSettings).mockResolvedValue({ ...settings, queueMode: "sequential" });
    await cueNextSet("u1", { source: "pwa", dropId: drop().id });
    const uris = vi.mocked(playback.playQueueOnDevice).mock.calls[0]![1].uris;
    expect(uris[0]).toBe("spotify:track:t1");
    expect(uris.slice(1).length).toBeGreaterThan(0);
    expect(new Set(uris.slice(1))).toEqual(new Set(["spotify:track:t6"]));
  });

  it("throws NO_DROPS when nothing is enabled", async () => {
    vi.mocked(dropsDb.listDrops).mockResolvedValue([]);
    await expect(cueNextSet("u1", { source: "pwa" })).rejects.toMatchObject({ code: "NO_DROPS", status: 409 });
    expect(playback.playQueueOnDevice).not.toHaveBeenCalled();
  });

  it("doesn't log a set when playback fails", async () => {
    vi.mocked(dropsDb.listDrops).mockResolvedValue([drop({ dropMs: 90000 })]);
    vi.mocked(playback.playQueueOnDevice).mockRejectedValueOnce(new Error("boom"));
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

  it("saves the current position as the drop", async () => {
    vi.mocked(spotify.getCurrentlyPlaying).mockResolvedValue(playing);
    vi.mocked(dropsDb.saveMarkedDrop).mockResolvedValue({
      drop: drop({ trackName: "Song", dropMs: 83662 }),
      created: true,
    });

    const result = await markDrop("u1");
    expect(dropsDb.saveMarkedDrop).toHaveBeenCalledWith("u1", playing.track, 83662);
    expect(result.message).toBe("Marked drop for Song at 1:23.6");
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

describe("Up next", () => {
  const upNext = drop({
    id: "22222222-2222-4222-8222-222222222222",
    trackId: "t2",
    trackUri: "spotify:track:t2",
    trackName: "Chosen",
    dropMs: 60000,
  });

  it("cue plays the Up next drop and then clears it", async () => {
    vi.mocked(settingsDb.getSettings).mockResolvedValue({ ...settings, nextDropId: upNext.id });
    vi.mocked(dropsDb.listDrops).mockResolvedValue([drop(), upNext]);

    const result = await cueNextSet("u1", { source: "pwa" });
    expect(result.track.name).toBe("Chosen");
    expect(settingsDb.updateSettings).toHaveBeenCalledWith("u1", { nextDropId: null });
  });

  it("an explicit dropId wins and leaves Up next alone", async () => {
    vi.mocked(settingsDb.getSettings).mockResolvedValue({ ...settings, nextDropId: upNext.id });
    vi.mocked(dropsDb.listDrops).mockResolvedValue([drop(), upNext]);

    const result = await cueNextSet("u1", { source: "pwa", dropId: drop().id });
    expect(result.track.name).toBe("Early Drop");
    expect(settingsDb.updateSettings).not.toHaveBeenCalled();
  });

  it("a stale Up next (disabled or deleted) falls back to the queue", async () => {
    vi.mocked(settingsDb.getSettings).mockResolvedValue({ ...settings, nextDropId: upNext.id });
    vi.mocked(dropsDb.listDrops).mockResolvedValue([drop()]);

    const result = await cueNextSet("u1", { source: "pwa" });
    expect(result.track.name).toBe("Early Drop");
    expect(settingsDb.updateSettings).not.toHaveBeenCalled();
  });
});

describe("startRest", () => {
  const target = drop({ trackName: "Animal", dropMs: 56_000, durationMs: 230_000 });
  const other = drop({
    id: "33333333-3333-4333-8333-333333333333",
    trackId: "t3",
    trackUri: "spotify:track:t3",
    durationMs: 200_000,
  });
  const allScopes = "user-library-read playlist-read-private playlist-read-collaborative";
  const listening = {
    kind: "track" as const,
    progressMs: 30_000,
    isPlaying: true,
    track: {
      id: "t1",
      uri: "spotify:track:t1",
      name: "Animal",
      artists: "3DG",
      albumArtUrl: null,
      durationMs: 230_000,
    },
  };

  beforeEach(() => {
    vi.mocked(dropsDb.listDrops).mockResolvedValue([target]);
    vi.mocked(usersDb.getUserById).mockResolvedValue({ scopes: allScopes } as never);
    vi.mocked(spotify.getCurrentlyPlaying).mockResolvedValue({ kind: "nothing" });
    vi.mocked(spotify.getLikedFillers).mockResolvedValue([]);
  });

  it("keeps what's playing and only schedules the cut at rest − drop", async () => {
    vi.mocked(spotify.getCurrentlyPlaying).mockResolvedValue(listening);
    vi.mocked(settingsDb.getSettings).mockResolvedValue({ ...settings, restSource: { kind: "liked" } });
    vi.mocked(spotify.getLikedFillers).mockResolvedValue([
      { uri: "spotify:track:f1", trackId: "f1", durationMs: 240_000 },
    ]);

    const before = Date.now();
    const result = await startRest("u1", { restMs: 210_000, source: "shortcut" });

    expect(playback.playQueueOnDevice).not.toHaveBeenCalled();
    const tappedAt = Date.parse(result.dropAt) - 210_000;
    expect(tappedAt).toBeGreaterThanOrEqual(before);
    expect(result.pendingCut).toMatchObject({
      setId: "set-1",
      trackId: "t1",
      drop: { uri: "spotify:track:t1", name: "Animal" },
      cutAt: tappedAt + 154_000,
    });
    // Backup music rides behind the drop song at the cut.
    expect(new Set(result.pendingCut!.afterUris)).toEqual(new Set(["spotify:track:f1"]));
    expect(setsDb.insertSet).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        positionMs: 0,
        leadMs: 210_000,
        source: "shortcut",
        cuedAt: new Date(tappedAt).toISOString(),
      }),
    );
    expect(result.message).toBe("⏱ 3:30 rest → Animal");
  });

  it("starts backup music from 0:00 when nothing is playing", async () => {
    vi.mocked(settingsDb.getSettings).mockResolvedValue({ ...settings, restSource: { kind: "liked" } });
    vi.mocked(spotify.getLikedFillers).mockResolvedValue([
      { uri: "spotify:track:f1", trackId: "f1", durationMs: 240_000 },
    ]);

    const result = await startRest("u1", { restMs: 210_000, source: "pwa" });
    const [, queue, position] = vi.mocked(playback.playQueueOnDevice).mock.calls[0]!;
    expect(new Set(queue.uris)).toEqual(new Set(["spotify:track:f1"]));
    expect(position()).toBe(0);
    expect(result.pendingCut).not.toBeNull();
  });

  it("treats a paused player as nothing playing", async () => {
    vi.mocked(spotify.getCurrentlyPlaying).mockResolvedValue({ ...listening, isPlaying: false });
    vi.mocked(dropsDb.listDrops).mockResolvedValue([target, other]);
    await startRest("u1", { dropId: target.id, restMs: 210_000, source: "pwa" });
    expect(playback.playQueueOnDevice).toHaveBeenCalled();
  });

  it("skips tagged songs in backup music so their drops aren't spoiled", async () => {
    vi.mocked(dropsDb.listDrops).mockResolvedValue([target, other]);
    vi.mocked(settingsDb.getSettings).mockResolvedValue({
      ...settings,
      restSource: { kind: "playlist", id: "pl1", name: "Rest" },
    });
    vi.mocked(spotify.getPlaylistFillers).mockResolvedValue([
      { uri: "spotify:track:t3", trackId: "t3", durationMs: 200_000 },
      { uri: "spotify:track:f9", trackId: "f9", durationMs: 200_000 },
    ]);

    await startRest("u1", { dropId: target.id, restMs: 210_000, source: "pwa" });
    expect(spotify.getPlaylistFillers).toHaveBeenCalledWith("u1", "pl1");
    expect(new Set(vi.mocked(playback.playQueueOnDevice).mock.calls[0]![1].uris)).toEqual(
      new Set(["spotify:track:f9"]),
    );
  });

  it("plays the drop song directly, with backup music behind it, when the rest is shorter than the build-up", async () => {
    vi.mocked(dropsDb.listDrops).mockResolvedValue([target, other]);
    const result = await startRest("u1", { dropId: target.id, restMs: 45_000, source: "pwa" });
    const [, queue, position] = vi.mocked(playback.playQueueOnDevice).mock.calls[0]!;
    expect(queue.uris[0]).toBe("spotify:track:t1");
    expect(new Set(queue.uris.slice(1))).toEqual(new Set(["spotify:track:t3"]));
    expect(position()).toBeGreaterThanOrEqual(11_000);
    expect(result.pendingCut).toBeNull();
    expect(setsDb.insertSet).toHaveBeenCalledWith("u1", expect.objectContaining({ positionMs: 11_000 }));
  });

  it("rejects a rest whose wait wouldn't fit in one function run", async () => {
    vi.mocked(dropsDb.listDrops).mockResolvedValue([drop({ dropMs: 5_000 })]);
    await expect(startRest("u1", { restMs: 300_000, source: "pwa" })).rejects.toMatchObject({ code: "REST_TOO_LONG" });
    expect(playback.playQueueOnDevice).not.toHaveBeenCalled();
  });

  it("asks for re-login when backup music is needed but the scopes are missing", async () => {
    vi.mocked(settingsDb.getSettings).mockResolvedValue({ ...settings, restSource: { kind: "liked" } });
    vi.mocked(usersDb.getUserById).mockResolvedValue({ scopes: "user-read-playback-state" } as never);
    await expect(startRest("u1", { restMs: 210_000, source: "pwa" })).rejects.toMatchObject({
      code: "PLAYLIST_ACCESS_REQUIRED",
    });
    expect(playback.playQueueOnDevice).not.toHaveBeenCalled();
  });

  it("doesn't need the scopes while music is playing (backup falls back to tagged songs)", async () => {
    vi.mocked(spotify.getCurrentlyPlaying).mockResolvedValue(listening);
    vi.mocked(settingsDb.getSettings).mockResolvedValue({ ...settings, restSource: { kind: "liked" } });
    vi.mocked(usersDb.getUserById).mockResolvedValue({ scopes: "user-read-playback-state" } as never);
    await expect(startRest("u1", { restMs: 210_000, source: "pwa" })).resolves.toMatchObject({ ok: true });
  });

  it("defaults backup music to Liked Songs when no source is saved", async () => {
    vi.mocked(spotify.getLikedFillers).mockResolvedValue([
      { uri: "spotify:track:f1", trackId: "f1", durationMs: 240_000 },
    ]);
    await startRest("u1", { restMs: 210_000, source: "pwa" });
    expect(new Set(vi.mocked(playback.playQueueOnDevice).mock.calls[0]![1].uris)).toEqual(
      new Set(["spotify:track:f1"]),
    );
  });

  it("uses only the other drop songs when that's the chosen source, without reading Spotify", async () => {
    vi.mocked(dropsDb.listDrops).mockResolvedValue([target, other]);
    vi.mocked(settingsDb.getSettings).mockResolvedValue({ ...settings, restSource: { kind: "tagged" } });
    await startRest("u1", { dropId: target.id, restMs: 210_000, source: "pwa" });
    expect(new Set(vi.mocked(playback.playQueueOnDevice).mock.calls[0]![1].uris)).toEqual(
      new Set(["spotify:track:t3"]),
    );
    expect(spotify.getLikedFillers).not.toHaveBeenCalled();
  });

  it("falls back to tagged songs when Liked Songs can't be read", async () => {
    vi.mocked(dropsDb.listDrops).mockResolvedValue([target, other]);
    vi.mocked(usersDb.getUserById).mockResolvedValue({ scopes: "user-read-playback-state" } as never);
    await startRest("u1", { dropId: target.id, restMs: 210_000, source: "pwa" });
    expect(new Set(vi.mocked(playback.playQueueOnDevice).mock.calls[0]![1].uris)).toEqual(
      new Set(["spotify:track:t3"]),
    );
  });

  it("fails with NO_FILLER when nothing is playing and there's no backup music", async () => {
    await expect(startRest("u1", { restMs: 210_000, source: "pwa" })).rejects.toMatchObject({
      code: "NO_FILLER",
      status: 409,
    });
    expect(setsDb.insertSet).not.toHaveBeenCalled();
  });
});

describe("performCut", () => {
  const cut: PendingCut = {
    setId: "set-1",
    trackId: "t1",
    drop: { uri: "spotify:track:t1", name: "Animal" },
    afterUris: ["spotify:track:f1", "spotify:track:f2"],
    cutAt: 1_000_000,
  };
  const latestSet = {
    id: "set-1",
    dropId: null,
    trackId: "t1",
    trackName: "Animal",
    cuedAt: "",
    positionMs: 0,
    leadMs: 90_000,
    source: "pwa" as const,
  };
  const playing = {
    kind: "track" as const,
    progressMs: 1000,
    isPlaying: true,
    track: { id: "f1", uri: "spotify:track:f1", name: "Filler", artists: "A", albumArtUrl: null, durationMs: 200_000 },
  };

  /** A fake clock: sleeping advances time exactly; `lateBy` simulates timer drift. */
  function fakeClock(start: number, lateBy = 0) {
    let t = start;
    return {
      now: () => t,
      sleep: async (ms: number) => {
        t += ms + lateBy;
      },
    };
  }

  beforeEach(() => {
    vi.mocked(setsDb.getLatestSet).mockResolvedValue(latestSet);
    vi.mocked(spotify.getCurrentlyPlaying).mockResolvedValue(playing);
  });

  it("starts the drop song from 0:00 at the cut time, with backup music behind it", async () => {
    const clock = fakeClock(900_000);
    await expect(performCut("u1", cut, clock)).resolves.toBe("played");
    const [, queue, position] = vi.mocked(playback.playQueueOnDevice).mock.calls[0]!;
    expect(queue.uris).toEqual(["spotify:track:t1", "spotify:track:f1", "spotify:track:f2"]);
    expect(clock.now()).toBe(1_000_000);
    expect(position()).toBe(0);
  });

  it("starts the drop song as far in as the cut fired late", async () => {
    const clock = fakeClock(900_000, 150);
    await performCut("u1", cut, clock);
    const position = vi.mocked(playback.playQueueOnDevice).mock.calls[0]![2];
    // The final sleep re-measures from the real time, so only its own 150 ms drift remains.
    expect(position()).toBe(150);
  });

  it("cuts whatever the user chose to play in the meantime", async () => {
    vi.mocked(spotify.getCurrentlyPlaying).mockResolvedValue({ kind: "local", name: "Their own file" });
    await expect(performCut("u1", cut, fakeClock(900_000))).resolves.toBe("played");
  });

  it("skips the cut when a newer rest or cue replaced this one", async () => {
    vi.mocked(setsDb.getLatestSet).mockResolvedValue({ ...latestSet, id: "set-2" });
    await expect(performCut("u1", cut, fakeClock(900_000))).resolves.toBe("superseded");
    expect(playback.playQueueOnDevice).not.toHaveBeenCalled();
  });

  it("skips the cut when the rest was swapped to another song", async () => {
    vi.mocked(setsDb.getLatestSet).mockResolvedValue({ ...latestSet, trackId: "t9" });
    await expect(performCut("u1", cut, fakeClock(900_000))).resolves.toBe("superseded");
    expect(playback.playQueueOnDevice).not.toHaveBeenCalled();
  });

  it("skips the cut when the user paused", async () => {
    vi.mocked(spotify.getCurrentlyPlaying).mockResolvedValue({ ...playing, isPlaying: false });
    await expect(performCut("u1", cut, fakeClock(900_000))).resolves.toBe("paused");
    expect(playback.playQueueOnDevice).not.toHaveBeenCalled();
  });

  it("reports failure instead of throwing", async () => {
    vi.mocked(playback.playQueueOnDevice).mockRejectedValueOnce(new Error("NO_DEVICE"));
    await expect(performCut("u1", cut, fakeClock(900_000))).resolves.toBe("failed");
  });
});

describe("swapRest", () => {
  const original = drop({ trackName: "Animal", dropMs: 56_000 });
  const swapIn = drop({
    id: "44444444-4444-4444-8444-444444444444",
    trackId: "t4",
    trackUri: "spotify:track:t4",
    trackName: "Swapped",
    dropMs: 30_000,
    durationMs: 200_000,
  });

  /** A rest whose drop is `leftMs` from now. */
  function restEndingIn(leftMs: number) {
    const leadMs = 210_000;
    return {
      id: "set-1",
      dropId: original.id,
      trackId: "t1",
      trackName: "Animal",
      cuedAt: new Date(Date.now() + leftMs - leadMs).toISOString(),
      positionMs: 0,
      leadMs,
      source: "pwa" as const,
    };
  }

  beforeEach(() => {
    vi.mocked(dropsDb.getDropOrThrow).mockResolvedValue(swapIn);
    vi.mocked(dropsDb.listDrops).mockResolvedValue([original, swapIn]);
    vi.mocked(usersDb.getUserById).mockResolvedValue({ scopes: null } as never);
    vi.mocked(setsDb.updateSetDrop).mockImplementation(async (_u, _id, swap) => ({ ...restEndingIn(0), ...swap }));
  });

  it("keeps the drop moment and the music, and just moves the cut", async () => {
    const rest = restEndingIn(100_000);
    vi.mocked(setsDb.getLatestSet).mockResolvedValue(rest);

    const result = await swapRest("u1", swapIn.id);
    const dropAt = Date.parse(rest.cuedAt) + rest.leadMs;
    expect(result.dropAt).toBe(new Date(dropAt).toISOString());
    expect(result.pendingCut).toMatchObject({
      setId: "set-1",
      trackId: "t4",
      drop: { uri: "spotify:track:t4", name: "Swapped" },
      cutAt: dropAt - 30_000,
    });
    // The old drop song is fine as backup music behind the new one.
    expect(new Set(result.pendingCut!.afterUris)).toEqual(new Set(["spotify:track:t1"]));
    expect(playback.playQueueOnDevice).not.toHaveBeenCalled();
    expect(setsDb.updateSetDrop).toHaveBeenCalledWith("u1", "set-1", {
      dropId: swapIn.id,
      trackId: "t4",
      trackName: "Swapped",
      positionMs: 0,
    });
  });

  it("starts the new song partway in when less time is left than its build-up", async () => {
    vi.mocked(setsDb.getLatestSet).mockResolvedValue(restEndingIn(20_000));
    const result = await swapRest("u1", swapIn.id);
    const [, queue, position] = vi.mocked(playback.playQueueOnDevice).mock.calls[0]!;
    expect(queue.uris[0]).toBe("spotify:track:t4");
    // ~20 s left, 30 s build-up → start ~10 s in (a little later for time spent in the test).
    expect(position()).toBeGreaterThanOrEqual(9_900);
    expect(position()).toBeLessThan(10_500);
    expect(result.pendingCut).toBeNull();
  });

  it("refuses when no rest is running", async () => {
    vi.mocked(setsDb.getLatestSet).mockResolvedValue(restEndingIn(-5_000));
    await expect(swapRest("u1", swapIn.id)).rejects.toMatchObject({ code: "NO_ACTIVE_REST" });
    vi.mocked(setsDb.getLatestSet).mockResolvedValue(null);
    await expect(swapRest("u1", swapIn.id)).rejects.toMatchObject({ code: "NO_ACTIVE_REST" });
  });
});
