import { requireUser } from "@/lib/auth/requireUser";
import { generateToken, hashToken } from "@/lib/crypto";
import { insertToken, listTokens } from "@/lib/db/tokens";
import { json, parseBody, route } from "@/lib/http";
import { tokenCreateSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const { userId } = await requireUser(req);
  return json({ tokens: await listTokens(userId) });
});

export const POST = route(async (req) => {
  const { userId } = await requireUser(req);
  const { label } = await parseBody(req, tokenCreateSchema);
  const token = generateToken(32);
  const { id } = await insertToken(userId, label, hashToken(token));
  // The raw token is returned exactly once and never stored or logged.
  return json({ id, token }, 201);
});
