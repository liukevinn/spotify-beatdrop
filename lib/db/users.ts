import { check, db, nowIso, unwrap, unwrapMaybe } from "@/lib/db/client";

export interface UserRow {
  id: string;
  spotify_user_id: string;
  display_name: string | null;
  refresh_token_enc: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  needs_reauth: boolean;
  scopes: string | null;
}

const USER_COLUMNS =
  "id, spotify_user_id, display_name, refresh_token_enc, access_token, access_token_expires_at, needs_reauth, scopes";

export async function getUserById(userId: string): Promise<UserRow | null> {
  const res = await db().from("users").select(USER_COLUMNS).eq("id", userId).maybeSingle<UserRow>();
  return unwrapMaybe(res, "getUserById");
}

export interface LoginTokens {
  spotifyUserId: string;
  displayName: string | null;
  refreshTokenEnc: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  scopes: string | null;
}

/** Inserts or updates the user keyed by Spotify id. Clears `needs_reauth`. */
export async function upsertUserFromLogin(input: LoginTokens): Promise<{ id: string }> {
  const res = await db()
    .from("users")
    .upsert(
      {
        spotify_user_id: input.spotifyUserId,
        display_name: input.displayName,
        refresh_token_enc: input.refreshTokenEnc,
        access_token: input.accessToken,
        access_token_expires_at: input.accessTokenExpiresAt,
        scopes: input.scopes,
        needs_reauth: false,
        updated_at: nowIso(),
      },
      { onConflict: "spotify_user_id" },
    )
    .select("id")
    .single<{ id: string }>();
  return unwrap(res, "upsertUserFromLogin");
}

export interface TokenUpdate {
  accessToken: string;
  accessTokenExpiresAt: string;
  /** Only set when Spotify rotated the refresh token. */
  refreshTokenEnc?: string;
  /** Only set when Spotify reported the granted scopes. */
  scopes?: string;
}

export async function saveAccessToken(userId: string, update: TokenUpdate): Promise<void> {
  const res = await db()
    .from("users")
    .update({
      access_token: update.accessToken,
      access_token_expires_at: update.accessTokenExpiresAt,
      ...(update.refreshTokenEnc ? { refresh_token_enc: update.refreshTokenEnc } : {}),
      ...(update.scopes ? { scopes: update.scopes } : {}),
      updated_at: nowIso(),
    })
    .eq("id", userId);
  check(res, "saveAccessToken");
}

export async function markNeedsReauth(userId: string): Promise<void> {
  const res = await db()
    .from("users")
    .update({ needs_reauth: true, access_token: null, access_token_expires_at: null, updated_at: nowIso() })
    .eq("id", userId);
  check(res, "markNeedsReauth");
}
