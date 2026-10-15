import { requireUser } from "@/lib/auth/requireUser";
import { revokeToken } from "@/lib/db/tokens";
import { json, parseIdParam, route } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const { userId } = await requireUser(req);
  await revokeToken(userId, await parseIdParam(ctx));
  return json({ ok: true });
});
