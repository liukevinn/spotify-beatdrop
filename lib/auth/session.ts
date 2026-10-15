import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export interface SessionData {
  userId?: string;
}

export const OAUTH_STATE_COOKIE = "dropset_oauth_state";
const SESSION_TTL_SEC = 60 * 60 * 24 * 180; // long-lived: the PWA should stay logged in

export function isSecureOrigin(): boolean {
  return env().APP_URL.startsWith("https://");
}

function sessionOptions(): SessionOptions {
  return {
    password: env().SESSION_SECRET,
    cookieName: "dropset_session",
    ttl: SESSION_TTL_SEC,
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: isSecureOrigin(), path: "/" },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

export async function getSessionUserId(): Promise<string | null> {
  return (await getSession()).userId ?? null;
}
