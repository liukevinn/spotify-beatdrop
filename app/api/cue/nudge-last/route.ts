import { requireUser } from "@/lib/auth/requireUser";
import { json, parseBody, route } from "@/lib/http";
import { nudgeLastCued } from "@/lib/services/drops";
import { nudgeSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const { userId } = await requireUser(req, { allowBearer: true });
  const { deltaMs } = await parseBody(req, nudgeSchema);
  return json(await nudgeLastCued(userId, deltaMs));
});
