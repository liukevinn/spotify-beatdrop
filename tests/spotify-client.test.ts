import { beforeEach, describe, expect, it, vi } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";
import type { UserRow } from "@/lib/db/users";
import { AppError } from "@/lib/errors";
import { getCurrentlyPlaying, getDevices, getValidAccessToken, spotifyFetch } from "@/lib/spotify/client";
import { emptyResponse, jsonResponse, mockFetch, spotifyError } from "./helpers";

vi.mock("@/lib/db/users", () => ({
  getUserById: vi.fn(),
  saveAccessToken: vi.fn(),
  markNeedsReauth: vi.fn(),
}));
const users = await import("@/lib/db/users");

const USER_ID = "user-1";
let user: UserRow;

function freshUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: USER_ID,
    spotify_user_id: "spotify-1",
    display_name: "Lifter",
    refresh_token_enc: encrypt("refresh-old"),
    access_token: "access-cached",
    access_token_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    needs_reauth: false,
    ...overrides,
  };
}

const tokenResponse = (extra: Record<string, unknown> = {}) =>
  jsonResponse({ access_token: "access-new", token_type: "Bearer", expires_in: 3600, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  user = freshUser();
  vi.mocked(users.getUserById).mockImplementation(async () => user);
  vi.mocked(users.saveAccessToken).mockImplementation(async (_id, update) => {
    user = {
      ...user,
      access_token: update.accessToken,
      access_token_expires_at: update.accessTokenExpiresAt,
      refresh_token_enc: update.refreshTokenEnc ?? user.refresh_token_enc,
    };
  });
});

describe("getValidAccessToken", () => {
  it("returns the cached token when it has more than 60 s left", async () => {
    const calls = mockFetch();
    await expect(getValidAccessToken(USER_ID)).resolves.toBe("access-cached");
    expect(calls).toHaveLength(0);
  });

  it("refreshes a token that expires within 60 s", async () => {
    user = freshUser({ access_token_expires_at: new Date(Date.now() + 30_000).toISOString() });
    const calls = mockFetch(() => tokenResponse());
    await expect(getValidAccessToken(USER_ID)).resolves.toBe("access-new");
    expect(calls[0]!.url).toBe("https://accounts.spotify.com/api/token");
    expect(calls[0]!.headers["authorization"]).toBe(
      `Basic ${Buffer.from("test-client-id:test-client-secret").toString("base64")}`,
    );
    expect(calls[0]!.body).toContain("grant_type=refresh_token");
    expect(calls[0]!.body).toContain("refresh_token=refresh-old");
  });

  it("persists a rotated refresh token (encrypted)", async () => {
    user = freshUser({ access_token: null });
    mockFetch(() => tokenResponse({ refresh_token: "refresh-rotated" }));
    await getValidAccessToken(USER_ID);
    const update = vi.mocked(users.saveAccessToken).mock.calls[0]![1];
    expect(update.refreshTokenEnc).toBeDefined();
    expect(update.refreshTokenEnc).not.toContain("refresh-rotated");
    expect(decrypt(update.refreshTokenEnc!)).toBe("refresh-rotated");
  });

  it("keeps the old refresh token when Spotify doesn't rotate it", async () => {
    user = freshUser({ access_token: null });
    mockFetch(() => tokenResponse());
    await getValidAccessToken(USER_ID);
    expect(vi.mocked(users.saveAccessToken).mock.calls[0]![1].refreshTokenEnc).toBeUndefined();
  });

  it("flags needs_reauth on invalid_grant", async () => {
    user = freshUser({ access_token: null });
    mockFetch(() => jsonResponse({ error: "invalid_grant", error_description: "Refresh token revoked" }, 400));
    await expect(getValidAccessToken(USER_ID)).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });
    expect(users.markNeedsReauth).toHaveBeenCalledWith(USER_ID);
  });

  it("maps other token-endpoint rejections (e.g. bad client secret) to SPOTIFY_ERROR", async () => {
    user = freshUser({ access_token: null });
    mockFetch(() => jsonResponse({ error: "invalid_client" }, 401));
    await expect(getValidAccessToken(USER_ID)).rejects.toMatchObject({ code: "SPOTIFY_ERROR", status: 502 });
    expect(users.markNeedsReauth).not.toHaveBeenCalled();
  });

  it("rejects users already flagged for re-auth without calling Spotify", async () => {
    user = freshUser({ needs_reauth: true });
    const calls = mockFetch();
    await expect(getValidAccessToken(USER_ID)).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });
    expect(calls).toHaveLength(0);
  });

  it("shares one refresh between concurrent callers", async () => {
    user = freshUser({ access_token: null });
    const calls = mockFetch(() => tokenResponse());
    const tokens = await Promise.all([getValidAccessToken(USER_ID), getValidAccessToken(USER_ID)]);
    expect(tokens).toEqual(["access-new", "access-new"]);
    expect(calls).toHaveLength(1);
  });
});

describe("spotifyFetch", () => {
  it("refreshes and retries once on 401", async () => {
    const calls = mockFetch(
      () => spotifyError(401),
      () => tokenResponse(),
      () => jsonResponse({ devices: [] }),
    );
    const res = await spotifyFetch(USER_ID, "/me/player/devices");
    expect(res.status).toBe(200);
    expect(calls.map((c) => c.headers["authorization"])).toEqual([
      "Bearer access-cached",
      expect.stringMatching(/^Basic /),
      "Bearer access-new",
    ]);
  });

  it("maps 403 PREMIUM_REQUIRED", async () => {
    mockFetch(() => spotifyError(403, "PREMIUM_REQUIRED"));
    await expect(spotifyFetch(USER_ID, "/me/player/play")).rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });
  });

  it("maps other 403s to SPOTIFY_FORBIDDEN", async () => {
    mockFetch(() => spotifyError(403));
    await expect(spotifyFetch(USER_ID, "/me/player")).rejects.toMatchObject({ code: "SPOTIFY_FORBIDDEN" });
  });

  it("retries a 429 once when Retry-After <= 2 s", async () => {
    const calls = mockFetch(
      () => jsonResponse({}, 429, { "Retry-After": "0" }),
      () => jsonResponse({ devices: [] }),
    );
    await expect(spotifyFetch(USER_ID, "/me/player/devices")).resolves.toBeInstanceOf(Response);
    expect(calls).toHaveLength(2);
  });

  it("fails fast with RATE_LIMITED when Retry-After is long", async () => {
    const calls = mockFetch(() => jsonResponse({}, 429, { "Retry-After": "30" }));
    await expect(spotifyFetch(USER_ID, "/me/player/devices")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(calls).toHaveLength(1);
  });

  it("fails with RATE_LIMITED on a second 429", async () => {
    mockFetch(
      () => jsonResponse({}, 429, { "Retry-After": "0" }),
      () => jsonResponse({}, 429, { "Retry-After": "0" }),
    );
    await expect(spotifyFetch(USER_ID, "/me/player/devices")).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("retries a 5xx once, then fails with SPOTIFY_ERROR", async () => {
    const calls = mockFetch(
      () => spotifyError(503),
      () => spotifyError(502),
    );
    await expect(spotifyFetch(USER_ID, "/me/player/devices")).rejects.toMatchObject({
      code: "SPOTIFY_ERROR",
      status: 502,
    });
    expect(calls).toHaveLength(2);
  });

  it("surfaces 404 as SpotifyHttpError for callers to handle", async () => {
    mockFetch(() => spotifyError(404, "NO_ACTIVE_DEVICE"));
    const err = await spotifyFetch(USER_ID, "/me/player/play").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ httpStatus: 404, reason: "NO_ACTIVE_DEVICE" });
  });
});

describe("typed calls", () => {
  it("treats 204 currently-playing as nothing playing", async () => {
    mockFetch(() => emptyResponse(204));
    await expect(getCurrentlyPlaying(USER_ID)).resolves.toEqual({ kind: "nothing" });
  });

  it("treats a podcast episode as nothing playing", async () => {
    mockFetch(() => jsonResponse({ is_playing: true, progress_ms: 1000, currently_playing_type: "episode", item: null }));
    await expect(getCurrentlyPlaying(USER_ID)).resolves.toEqual({ kind: "nothing" });
  });

  it("flags local files", async () => {
    mockFetch(() =>
      jsonResponse({
        is_playing: true,
        progress_ms: 1000,
        currently_playing_type: "track",
        item: { id: null, uri: "spotify:local:x", name: "Demo", is_local: true, duration_ms: 1, artists: [], album: {} },
      }),
    );
    await expect(getCurrentlyPlaying(USER_ID)).resolves.toEqual({ kind: "local", name: "Demo" });
  });

  it("parses a playing track", async () => {
    mockFetch(() =>
      jsonResponse({
        is_playing: true,
        progress_ms: 83412,
        currently_playing_type: "track",
        item: {
          id: "t1",
          uri: "spotify:track:t1",
          name: "Song",
          duration_ms: 200000,
          artists: [{ name: "A" }, { name: "B" }],
          album: { images: [{ url: "https://i.scdn.co/image/1" }] },
        },
      }),
    );
    await expect(getCurrentlyPlaying(USER_ID)).resolves.toEqual({
      kind: "track",
      progressMs: 83412,
      isPlaying: true,
      track: {
        id: "t1",
        uri: "spotify:track:t1",
        name: "Song",
        artists: "A, B",
        albumArtUrl: "https://i.scdn.co/image/1",
        durationMs: 200000,
      },
    });
  });

  it("skips restricted devices that have no id", async () => {
    mockFetch(() =>
      jsonResponse({
        devices: [
          { id: "d1", name: "iPhone", type: "Smartphone", is_active: true },
          { id: null, name: "Car", type: "Automobile", is_active: false },
        ],
      }),
    );
    await expect(getDevices(USER_ID)).resolves.toEqual([
      { id: "d1", name: "iPhone", type: "Smartphone", isActive: true },
    ]);
  });
});
