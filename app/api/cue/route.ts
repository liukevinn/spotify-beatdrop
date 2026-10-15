import { requireUser } from "@/lib/auth/requireUser";
import { json, parseBody, route } from "@/lib/http";
import { cueNextSet } from "@/lib/services/cue";
import { cueSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const { userId, source } = await requireUser(req, { allowBearer: true });
  const { dropId } = await parseBody(req, cueSchema);
  return json(await cueNextSet(userId, { dropId, source: source === "bearer" ? "shortcut" : "pwa" }));
});
