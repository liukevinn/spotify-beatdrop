import { beforeEach, describe, expect, it, vi } from "vitest";
import { encrypt } from "@/lib/crypto";
import { findRecoveryDevice, pickFallbackDevice, playOnDevice } from "@/lib/spotify/playback";
import type { Device, Settings } from "@/lib/types";
import { emptyResponse, jsonResponse, mockFetch, spotifyError } from "./helpers";

vi.mock("@/lib/db/users", () => ({
  getUserById: vi.fn(async () => ({
    id: "u1",
    spotify_user_id: "s1",
    display_name: null,
    refresh_token_enc: encrypt("r"),
    access_token: "access",
    access_token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    needs_reauth: false,
  })),
  saveAccessToken: vi.fn(),
  markNeedsReauth: vi.fn(),
}));
vi.mock("@/lib/db/settings", () => ({ getSettings: vi.fn(), updateSettings: vi.fn() }));
const settingsDb = await import("@/lib/db/settings");

const baseSettings: Settings = {
  leadMs: 20000,
  reactionOffsetMs: 250,
  queueMode: "shuffle",
  avoidRepeatWithin: 5,
  deviceId: "phone-old",
  deviceName: "Kev's iPhone",
};
const track = { uri: "spotify:track:t1", name: "Song" };
const phone: Device = { id: "phone-new", name: "Kev's iPhone", type: "Smartphone", isActive: false };
const laptop: Device = { id: "laptop", name: "MacBook", type: "Computer", isActive: true };
const devicesJson = (devices: Device[]) =>
  jsonResponse({ devices: devices.map((d) => ({ id: d.id, name: d.name, type: d.type, is_active: d.isActive })) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(settingsDb.getSettings).mockResolvedValue(baseSettings);
});

describe("device selection", () => {
  it("fallback prefers a phone, then the active device", () => {
    expect(pickFallbackDevice([laptop, phone])).toBe(phone);
    expect(pickFallbackDevice([laptop])).toBe(laptop);
    expect(pickFallbackDevice([])).toBeNull();
  });

  it("recovery matches id, then phone name, then any phone", () => {
    const other: Device = { ...phone, id: "p2", name: "Other" };
    expect(findRecoveryDevice([other, { ...phone, id: "phone-old" }], baseSettings)?.id).toBe("phone-old");
    expect(findRecoveryDevice([other, phone], baseSettings)?.id).toBe("phone-new");
    expect(findRecoveryDevice([laptop, other], baseSettings)?.id).toBe("p2");
    expect(findRecoveryDevice([laptop], baseSettings)).toBeNull();
  });
});

describe("playOnDevice", () => {
  it("plays on the linked device", async () => {
    const calls = mockFetch(() => emptyResponse(204));
    await playOnDevice("u1", track, 63412);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.url).toBe("https://api.spotify.com/v1/me/player/play?device_id=phone-old");
    expect(JSON.parse(calls[0]!.body!)).toEqual({ uris: ["spotify:track:t1"], position_ms: 63412 });
  });

  it("on 404: finds the phone, relinks it, transfers, and retries", async () => {
    const calls = mockFetch(
      () => spotifyError(404, "NO_ACTIVE_DEVICE"),
      () => devicesJson([laptop, phone]),
      () => emptyResponse(204),
      () => emptyResponse(202),
    );
    await playOnDevice("u1", track, 1000);

    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      "PUT /v1/me/player/play",
      "GET /v1/me/player/devices",
      "PUT /v1/me/player",
      "PUT /v1/me/player/play",
    ]);
    expect(JSON.parse(calls[2]!.body!)).toEqual({ device_ids: ["phone-new"], play: false });
    expect(calls[3]!.url).toContain("device_id=phone-new");
    expect(settingsDb.updateSettings).toHaveBeenCalledWith("u1", { deviceId: "phone-new", deviceName: "Kev's iPhone" });
  });

  it("throws NO_DEVICE when no phone is reachable after a 404", async () => {
    mockFetch(
      () => spotifyError(404),
      () => devicesJson([laptop]),
    );
    await expect(playOnDevice("u1", track, 0)).rejects.toMatchObject({ code: "NO_DEVICE" });
  });

  it("throws NO_DEVICE when the retry also fails", async () => {
    mockFetch(
      () => spotifyError(404),
      () => devicesJson([phone]),
      () => emptyResponse(204),
      () => spotifyError(404),
    );
    await expect(playOnDevice("u1", track, 0)).rejects.toMatchObject({ code: "NO_DEVICE" });
  });

  it("uses a fallback device when none is linked", async () => {
    vi.mocked(settingsDb.getSettings).mockResolvedValue({ ...baseSettings, deviceId: null, deviceName: null });
    const calls = mockFetch(
      () => devicesJson([laptop, phone]),
      () => emptyResponse(204),
    );
    await playOnDevice("u1", track, 0);
    expect(calls[1]!.url).toContain("device_id=phone-new");
  });

  it("throws NO_DEVICE when nothing is linked and no device exists", async () => {
    vi.mocked(settingsDb.getSettings).mockResolvedValue({ ...baseSettings, deviceId: null, deviceName: null });
    mockFetch(() => devicesJson([]));
    await expect(playOnDevice("u1", track, 0)).rejects.toMatchObject({ code: "NO_DEVICE" });
  });

  it("maps other client errors to TRACK_UNAVAILABLE with the track name", async () => {
    mockFetch(() => spotifyError(400));
    await expect(playOnDevice("u1", track, 0)).rejects.toMatchObject({
      code: "TRACK_UNAVAILABLE",
      message: "Couldn't play Song. Try again.",
    });
  });
});
