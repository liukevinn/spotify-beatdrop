import { requireUser } from "@/lib/auth/requireUser";
import { json, parseBody, route } from "@/lib/http";
import { markDrop } from "@/lib/services/drops";
import { markSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const { userId } = await requireUser(req, { allowBearer: true });
  const body = await parseBody(req, markSchema);
  return json(await markDrop(userId, body));
});
