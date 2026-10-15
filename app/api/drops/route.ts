import { requireUser } from "@/lib/auth/requireUser";
import { listDrops } from "@/lib/db/drops";
import { json, route } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const { userId } = await requireUser(req);
  return json({ drops: await listDrops(userId) });
});
