import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, OAUTH_STATE_COOKIE } from "@/lib/auth/session";
import { encrypt } from "@/lib/crypto";
import { ensureSettings } from "@/lib/db/settings";
import { upsertUserFromLogin } from "@/lib/db/users";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { fetchProfile } from "@/lib/spotify/client";
import { exchangeCode, expiresAtIso } from "@/lib/spotify/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectTo(path: string) {
  return NextResponse.redirect(new URL(path, env().APP_URL));
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete({ name: OAUTH_STATE_COOKIE, path: "/api/auth" });

  if (params.get("error")) return redirectTo("/login?error=ACCESS_DENIED");
  const code = params.get("code");
  if (!code || !expectedState || params.get("state") !== expectedState) {
    return redirectTo("/login?error=STATE_MISMATCH");
  }

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) throw new AppError("SPOTIFY_ERROR");
    const profile = await fetchProfile(tokens.access_token);

    const user = await upsertUserFromLogin({
      spotifyUserId: profile.id,
      displayName: profile.displayName,
      refreshTokenEnc: encrypt(tokens.refresh_token),
      accessToken: tokens.access_token,
      accessTokenExpiresAt: expiresAtIso(tokens.expires_in),
      scopes: tokens.scope ?? null,
    });
    await ensureSettings(user.id);

    const session = await getSession();
    session.userId = user.id;
    await session.save();
  } catch (err) {
    const errorCode = err instanceof AppError ? err.code : "LOGIN_FAILED";
    console.error("[auth] callback failed:", errorCode);
    return redirectTo(`/login?error=${errorCode}`);
  }

  return redirectTo("/");
}
