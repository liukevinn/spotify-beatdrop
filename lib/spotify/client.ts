import { decrypt, encrypt } from "@/lib/crypto";
import { getUserById, markNeedsReauth, saveAccessToken } from "@/lib/db/users";
import { AppError, SpotifyHttpError } from "@/lib/errors";
import { expiresAtIso, OAuthError, refreshAccessToken } from "@/lib/spotify/oauth";
import {
  apiErrorSchema,
  currentlyPlayingSchema,
  devicesSchema,
  fillerTrackSchema,
  playlistItemsSchema,
  playlistsSchema,
  profileSchema,
  savedTracksSchema,
  trackItemSchema,
} from "@/lib/spotify/types";
import type { Filler } from "@/lib/logic/segue";
import type { Device, PlaylistInfo, TrackInfo } from "@/lib/types";
import { sleep } from "@/lib/utils";

const API_BASE = "https://api.spotify.com/v1";
/** Refresh when the cached token has less than this left. */
const EXPIRY_SKEW_MS = 60_000;
const MAX_RATE_LIMIT_WAIT_SEC = 2;
const SERVER_ERROR_RETRY_MS = 300;

// ---------------------------------------------------------------------------
// Access tokens
// ---------------------------------------------------------------------------

/** One in-flight refresh per user, so concurrent requests don't race the rotation. */
const refreshesInFlight = new Map<string, Promise<string>>();

export async function getValidAccessToken(userId: string, opts: { forceRefresh?: boolean } = {}): Promise<string> {
  const user = await getUserById(userId);
  if (!user) throw new AppError("UNAUTHENTICATED");
  if (user.needs_reauth) throw new AppError("REAUTH_REQUIRED");

  const expiresAt = user.access_token_expires_at ? Date.parse(user.access_token_expires_at) : 0;
  if (!opts.forceRefresh && user.access_token && expiresAt - Date.now() > EXPIRY_SKEW_MS) {
    return user.access_token;
  }

  const inFlight = refreshesInFlight.get(userId);
  if (inFlight) return inFlight;

  const refresh = refreshForUser(userId, user.refresh_token_enc).finally(() => refreshesInFlight.delete(userId));
  refreshesInFlight.set(userId, refresh);
  return refresh;
}

async function refreshForUser(userId: string, refreshTokenEnc: string): Promise<string> {
  let tokens;
  try {
    tokens = await refreshAccessToken(decrypt(refreshTokenEnc));
  } catch (err) {
    if (err instanceof OAuthError) {
      if (err.oauthCode === "invalid_grant") {
        await markNeedsReauth(userId);
        throw new AppError("REAUTH_REQUIRED");
      }
      console.error("[spotify] token refresh rejected:", err.oauthCode);
      throw new AppError("SPOTIFY_ERROR");
    }
    throw err;
  }

  await saveAccessToken(userId, {
    accessToken: tokens.access_token,
    accessTokenExpiresAt: expiresAtIso(tokens.expires_in),
    // Spotify may rotate the refresh token; persist the new one if so.
    refreshTokenEnc: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
    scopes: tokens.scope,
  });
  return tokens.access_token;
}

// ---------------------------------------------------------------------------
// Low-level request with Spotify's error semantics (spec §7.4)
// ---------------------------------------------------------------------------

interface SpotifyRequest {
  method?: "GET" | "PUT";
  query?: Record<string, string>;
  body?: unknown;
}

async function readErrorReason(res: Response): Promise<string | undefined> {
  const payload: unknown = await res.json().catch(() => null);
  const parsed = apiErrorSchema.safeParse(payload);
  return parsed.success ? parsed.data.error.reason : undefined;
}

function send(token: string, path: string, req: SpotifyRequest): Promise<Response> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(req.query ?? {})) url.searchParams.set(key, value);

  return fetch(url, {
    method: req.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
    cache: "no-store",
  }).catch(() => {
    throw new AppError("SPOTIFY_ERROR");
  });
}

/**
 * Authenticated Spotify Web API call. Returns the response on 2xx.
 * - 401: refresh once, retry once
 * - 403: PREMIUM_REQUIRED or SPOTIFY_FORBIDDEN
 * - 429: retry once if Retry-After <= 2 s, else RATE_LIMITED
 * - 5xx: retry once after 300 ms
 * - anything else: SpotifyHttpError (callers may handle e.g. 404)
 */
export async function spotifyFetch(userId: string, path: string, req: SpotifyRequest = {}): Promise<Response> {
  let token = await getValidAccessToken(userId);
  let refreshed = false;
  let rateLimitRetried = false;
  let serverErrorRetried = false;

  for (;;) {
    const res = await send(token, path, req);
    if (res.ok) return res;

    if (res.status === 401 && !refreshed) {
      refreshed = true;
      token = await getValidAccessToken(userId, { forceRefresh: true });
      continue;
    }
    if (res.status === 429) {
      const retryAfterSec = Number(res.headers.get("Retry-After"));
      if (!rateLimitRetried && Number.isFinite(retryAfterSec) && retryAfterSec <= MAX_RATE_LIMIT_WAIT_SEC) {
        rateLimitRetried = true;
        await sleep(retryAfterSec * 1000);
        continue;
      }
      throw new AppError("RATE_LIMITED");
    }
    if (res.status >= 500 && !serverErrorRetried) {
      serverErrorRetried = true;
      await sleep(SERVER_ERROR_RETRY_MS);
      continue;
    }

    const reason = await readErrorReason(res);
    if (res.status === 403) {
      throw new AppError(reason === "PREMIUM_REQUIRED" ? "PREMIUM_REQUIRED" : "SPOTIFY_FORBIDDEN");
    }
    throw new SpotifyHttpError(res.status, reason);
  }
}

// ---------------------------------------------------------------------------
// Typed calls (the only endpoints DropSet uses, spec §7.3)
// ---------------------------------------------------------------------------

/** GET /me with a fresh access token (used at login, before the user row exists). */
export async function fetchProfile(accessToken: string): Promise<{ id: string; displayName: string | null }> {
  const res = await send(accessToken, "/me", {});
  if (res.status === 403) throw new AppError("SPOTIFY_FORBIDDEN");
  if (!res.ok) throw new SpotifyHttpError(res.status, await readErrorReason(res));
  const profile = profileSchema.parse(await res.json());
  return { id: profile.id, displayName: profile.display_name ?? null };
}

export type CurrentlyPlaying =
  | { kind: "nothing" }
  | { kind: "local"; name: string }
  | { kind: "track"; track: TrackInfo; progressMs: number; isPlaying: boolean };

export async function getCurrentlyPlaying(userId: string): Promise<CurrentlyPlaying> {
  const res = await spotifyFetch(userId, "/me/player/currently-playing");
  if (res.status === 204) return { kind: "nothing" };

  const text = await res.text();
  if (!text.trim()) return { kind: "nothing" };

  const parsed = currentlyPlayingSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new AppError("SPOTIFY_ERROR");
  const now = parsed.data;
  if (now.currently_playing_type !== "track" || !now.item) return { kind: "nothing" };

  const item = trackItemSchema.safeParse(now.item);
  if (!item.success) return { kind: "nothing" };
  if (item.data.is_local || !item.data.id) return { kind: "local", name: item.data.name };

  return {
    kind: "track",
    track: {
      id: item.data.id,
      uri: item.data.uri,
      name: item.data.name,
      artists: item.data.artists.map((a) => a.name).join(", "),
      albumArtUrl: item.data.album.images?.[0]?.url ?? null,
      durationMs: item.data.duration_ms,
    },
    progressMs: now.progress_ms ?? 0,
    isPlaying: now.is_playing,
  };
}

export async function getDevices(userId: string): Promise<Device[]> {
  const res = await spotifyFetch(userId, "/me/player/devices");
  const parsed = devicesSchema.safeParse(await res.json());
  if (!parsed.success) throw new AppError("SPOTIFY_ERROR");
  // Restricted devices have no id and can't be controlled; skip them.
  return parsed.data.devices.flatMap((d) =>
    d.id ? [{ id: d.id, name: d.name, type: d.type, isActive: d.is_active }] : [],
  );
}

export async function transferPlayback(userId: string, deviceId: string): Promise<void> {
  await spotifyFetch(userId, "/me/player", { method: "PUT", body: { device_ids: [deviceId], play: false } });
}

/**
 * Plays `uris` in order, starting the first at `positionMs`. For a multi-track queue,
 * `offset: 0` pins the first track even if the device has shuffle on.
 */
export async function startPlayback(
  userId: string,
  deviceId: string,
  uris: string[],
  positionMs: number,
): Promise<void> {
  await spotifyFetch(userId, "/me/player/play", {
    method: "PUT",
    query: { device_id: deviceId },
    body: { uris, position_ms: positionMs, ...(uris.length > 1 ? { offset: { position: 0 } } : {}) },
  });
}

/**
 * Turns off shuffle and repeat so a segue queue plays straight through.
 * Best effort: a sleeping device 404s here, and playback recovery handles that.
 */
export async function playStraightThrough(userId: string, deviceId: string): Promise<void> {
  const results = await Promise.allSettled([
    spotifyFetch(userId, "/me/player/shuffle", { method: "PUT", query: { state: "false", device_id: deviceId } }),
    spotifyFetch(userId, "/me/player/repeat", { method: "PUT", query: { state: "off", device_id: deviceId } }),
  ]);
  for (const r of results) {
    if (r.status === "rejected") console.warn("[spotify] shuffle/repeat reset failed:", (r.reason as Error)?.message);
  }
}

// ---------------------------------------------------------------------------
// Rest filler sources (spec §11.5). Need the scopes in REST_SCOPES.
// ---------------------------------------------------------------------------

/** How many tracks a filler source contributes (2 pages of 50, fetched in parallel). */
export const FILLER_SOURCE_LIMIT = 100;
const PAGE_SIZE = 50;
const PAGE_OFFSETS = Array.from({ length: FILLER_SOURCE_LIMIT / PAGE_SIZE }, (_, i) => i * PAGE_SIZE);

function toFiller(raw: unknown): (Filler & { trackId: string }) | null {
  const parsed = fillerTrackSchema.safeParse(raw);
  if (!parsed.success) return null;
  const t = parsed.data;
  if (t.is_local || !t.id || (t.type !== undefined && t.type !== "track")) return null;
  return { uri: t.uri, trackId: t.id, durationMs: t.duration_ms };
}

/** The most recently liked tracks. */
export async function getLikedFillers(userId: string): Promise<(Filler & { trackId: string })[]> {
  const pages = await Promise.all(
    PAGE_OFFSETS.map(async (offset) => {
      const res = await spotifyFetch(userId, "/me/tracks", {
        query: { limit: String(PAGE_SIZE), offset: String(offset) },
      });
      const parsed = savedTracksSchema.safeParse(await res.json());
      if (!parsed.success) throw new AppError("SPOTIFY_ERROR");
      return parsed.data.items.map((i) => toFiller(i.track));
    }),
  );
  return pages.flat().filter((f) => f !== null);
}

/** The first tracks of a playlist the user owns or collaborates on (others return no items). */
export async function getPlaylistFillers(
  userId: string,
  playlistId: string,
): Promise<(Filler & { trackId: string })[]> {
  const pages = await Promise.all(
    PAGE_OFFSETS.map(async (offset) => {
      const res = await spotifyFetch(userId, `/playlists/${encodeURIComponent(playlistId)}/items`, {
        query: { limit: String(PAGE_SIZE), offset: String(offset) },
      });
      const parsed = playlistItemsSchema.safeParse(await res.json());
      if (!parsed.success) throw new AppError("SPOTIFY_ERROR");
      return parsed.data.items.map((i) => toFiller(i.item ?? i.track));
    }),
  );
  return pages.flat().filter((f) => f !== null);
}

/** Playlists the user owns or collaborates on: the only ones whose tracks a dev-mode app can read. */
export async function getMyPlaylists(userId: string, spotifyUserId: string): Promise<PlaylistInfo[]> {
  const res = await spotifyFetch(userId, "/me/playlists", { query: { limit: "50" } });
  const parsed = playlistsSchema.safeParse(await res.json());
  if (!parsed.success) throw new AppError("SPOTIFY_ERROR");
  return parsed.data.items.flatMap((p) =>
    p && (p.owner.id === spotifyUserId || p.collaborative)
      ? [
          {
            id: p.id,
            name: p.name,
            trackCount: p.items?.total ?? p.tracks?.total ?? null,
            imageUrl: p.images?.[0]?.url ?? null,
          },
        ]
      : [],
  );
}
