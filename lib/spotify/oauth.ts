import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { oauthErrorSchema, tokenResponseSchema, type TokenResponse } from "@/lib/spotify/types";

const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

export const SPOTIFY_SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
] as const;

/** Thrown when Spotify's token endpoint rejects a request (e.g. `invalid_grant`). */
export class OAuthError extends Error {
  readonly oauthCode: string;

  constructor(oauthCode: string) {
    super(`Spotify token request failed: ${oauthCode}`);
    this.name = "OAuthError";
    this.oauthCode = oauthCode;
  }
}

export function buildAuthorizeUrl(state: string): string {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_URI } = env();
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: SPOTIFY_SCOPES.join(" "),
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

async function requestToken(body: Record<string, string>): Promise<TokenResponse> {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = env();
  const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams(body),
    cache: "no-store",
  });

  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = oauthErrorSchema.safeParse(payload);
    if (parsed.success) throw new OAuthError(parsed.data.error);
    throw new AppError("SPOTIFY_ERROR");
  }

  const parsed = tokenResponseSchema.safeParse(payload);
  if (!parsed.success) throw new AppError("SPOTIFY_ERROR");
  return parsed.data;
}

export function exchangeCode(code: string): Promise<TokenResponse> {
  return requestToken({ grant_type: "authorization_code", code, redirect_uri: env().SPOTIFY_REDIRECT_URI });
}

export function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return requestToken({ grant_type: "refresh_token", refresh_token: refreshToken });
}

/** ISO timestamp for when a token with `expires_in` seconds will expire. */
export function expiresAtIso(expiresInSec: number, now = Date.now()): string {
  return new Date(now + expiresInSec * 1000).toISOString();
}
