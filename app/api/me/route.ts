import { requireUser } from "@/lib/auth/requireUser";
import { getSettings } from "@/lib/db/settings";
import { json, route } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const user = await requireUser(req, { allowNeedsReauth: true });
  const settings = await getSettings(user.userId);
  return json({
    displayName: user.displayName,
    needsReauth: user.needsReauth,
    deviceLinked: settings.deviceId !== null,
  });
});
