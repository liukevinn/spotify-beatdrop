import { requireUser } from "@/lib/auth/requireUser";
import { deleteDrop, updateDrop } from "@/lib/db/drops";
import { json, parseBody, parseIdParam, route } from "@/lib/http";
import { dropPatchSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, ctx) => {
  const { userId } = await requireUser(req);
  const id = await parseIdParam(ctx);
  const patch = await parseBody(req, dropPatchSchema);
  return json({ drop: await updateDrop(userId, id, patch) });
});

export const DELETE = route<Ctx>(async (req, ctx) => {
  const { userId } = await requireUser(req);
  await deleteDrop(userId, await parseIdParam(ctx));
  return json({ ok: true });
});
