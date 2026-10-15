import { requireUser } from "@/lib/auth/requireUser";
import { json, parseBody, parseIdParam, route } from "@/lib/http";
import { nudgeDrop } from "@/lib/services/drops";
import { nudgeSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const { userId } = await requireUser(req);
  const id = await parseIdParam(ctx);
  const { deltaMs } = await parseBody(req, nudgeSchema);
  return json({ drop: await nudgeDrop(userId, id, deltaMs) });
});
