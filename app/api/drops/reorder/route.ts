import { requireUser } from "@/lib/auth/requireUser";
import { reorderDrops } from "@/lib/db/drops";
import { json, parseBody, route } from "@/lib/http";
import { reorderSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const { userId } = await requireUser(req);
  const { ids } = await parseBody(req, reorderSchema);
  await reorderDrops(userId, ids);
  return json({ ok: true });
});
