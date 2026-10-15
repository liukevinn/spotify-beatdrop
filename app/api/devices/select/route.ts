import { requireUser } from "@/lib/auth/requireUser";
import { updateSettings } from "@/lib/db/settings";
import { json, parseBody, route } from "@/lib/http";
import { deviceSelectSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const { userId } = await requireUser(req);
  const { deviceId, deviceName } = await parseBody(req, deviceSelectSchema);
  const settings = await updateSettings(userId, { deviceId, deviceName });
  return json({ settings });
});
