import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isSecureOrigin, OAUTH_STATE_COOKIE } from "@/lib/auth/session";
import { generateToken } from "@/lib/crypto";
import { buildAuthorizeUrl } from "@/lib/spotify/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_TTL_SEC = 10 * 60;

export async function GET() {
  const state = generateToken(32);
  (await cookies()).set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureOrigin(),
    path: "/api/auth",
    maxAge: STATE_TTL_SEC,
  });
  return NextResponse.redirect(buildAuthorizeUrl(state));
}
