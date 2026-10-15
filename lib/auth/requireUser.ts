import { getSessionUserId } from "@/lib/auth/session";
import { hashToken } from "@/lib/crypto";
import { touchActiveToken } from "@/lib/db/tokens";
import { getUserById } from "@/lib/db/users";
import { AppError } from "@/lib/errors";

export interface AuthedUser {
  userId: string;
  displayName: string | null;
  needsReauth: boolean;
  source: "cookie" | "bearer";
}

export interface RequireUserOptions {
  /** Accept `Authorization: Bearer <shortcut token>`. Only cue, mark, and nudge-last set this. */
  allowBearer?: boolean;
  /** Return users flagged `needs_reauth` instead of rejecting them (for `/api/me`). */
  allowNeedsReauth?: boolean;
}

function bearerToken(req: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  return match?.[1] ?? null;
}

async function resolveUserId(req: Request, allowBearer: boolean): Promise<{ userId: string; source: AuthedUser["source"] }> {
  const token = allowBearer ? bearerToken(req) : null;
  if (token) {
    // A presented bearer token must be valid; never fall back to the cookie.
    const match = await touchActiveToken(hashToken(token));
    if (!match) throw new AppError("UNAUTHENTICATED", "That shortcut token isn't valid.");
    return { userId: match.userId, source: "bearer" };
  }

  const userId = await getSessionUserId();
  if (!userId) throw new AppError("UNAUTHENTICATED");
  return { userId, source: "cookie" };
}

/** Resolves the caller from a bearer token (where allowed) or the session cookie. */
export async function requireUser(req: Request, opts: RequireUserOptions = {}): Promise<AuthedUser> {
  const { userId, source } = await resolveUserId(req, opts.allowBearer ?? false);

  const user = await getUserById(userId);
  if (!user) throw new AppError("UNAUTHENTICATED");
  if (user.needs_reauth && !opts.allowNeedsReauth) throw new AppError("REAUTH_REQUIRED");

  return { userId, displayName: user.display_name, needsReauth: user.needs_reauth, source };
}
