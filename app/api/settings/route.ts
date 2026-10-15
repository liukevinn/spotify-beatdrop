import { requireUser } from "@/lib/auth/requireUser";
import { getSettings, updateSettings } from "@/lib/db/settings";
import { json, parseBody, route } from "@/lib/http";
import { settingsPatchSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const { userId } = await requireUser(req);
  return json(await getSettings(userId));
});

export const PATCH = route(async (req) => {
  const { userId } = await requireUser(req);
  const patch = await parseBody(req, settingsPatchSchema);
  return json(await updateSettings(userId, patch));
});
