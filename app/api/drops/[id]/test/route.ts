import { requireUser } from "@/lib/auth/requireUser";
import { json, parseIdParam, route } from "@/lib/http";
import { testDrop } from "@/lib/services/drops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const { userId } = await requireUser(req);
  await testDrop(userId, await parseIdParam(ctx));
  return json({ ok: true });
});
