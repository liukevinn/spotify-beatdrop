import { requireUser } from "@/lib/auth/requireUser";
import { json, route } from "@/lib/http";
import { markDrop } from "@/lib/services/drops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const { userId } = await requireUser(req, { allowBearer: true });
  return json(await markDrop(userId));
});
