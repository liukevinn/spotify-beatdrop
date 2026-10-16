import { db, nowIso, unwrap, unwrapMaybe } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import type { TokenInfo } from "@/lib/types";

interface TokenRow {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
}

function toTokenInfo(row: TokenRow): TokenInfo {
  return {
    id: row.id,
    label: row.label,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

export async function insertToken(userId: string, label: string, tokenHash: string): Promise<{ id: string }> {
  const res = await db()
    .from("api_tokens")
    .insert({ user_id: userId, label, token_hash: tokenHash })
    .select("id")
    .single<{ id: string }>();
  return unwrap(res, "insertToken");
}

/** Active tokens only. Revoked tokens are deleted; `revoked_at` rows predate that. */
export async function listTokens(userId: string): Promise<TokenInfo[]> {
  const res = await db()
    .from("api_tokens")
    .select("id, label, created_at, last_used_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  return unwrap(res, "listTokens").map((r) => toTokenInfo(r as TokenRow));
}

/** Revoking deletes the token, so the list never fills up with dead ones. */
export async function revokeToken(userId: string, tokenId: string): Promise<void> {
  const res = await db().from("api_tokens").delete().eq("user_id", userId).eq("id", tokenId).select("id");
  if (unwrap(res, "revokeToken").length === 0) {
    throw new AppError("NOT_FOUND", "That token doesn't exist or is already revoked.");
  }
}

/** Resolves an active (non-revoked) token by hash and stamps `last_used_at`. */
export async function touchActiveToken(tokenHash: string): Promise<{ userId: string } | null> {
  const res = await db()
    .from("api_tokens")
    .update({ last_used_at: nowIso() })
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .select("user_id")
    .maybeSingle<{ user_id: string }>();
  const row = unwrapMaybe(res, "touchActiveToken");
  return row ? { userId: row.user_id } : null;
}
