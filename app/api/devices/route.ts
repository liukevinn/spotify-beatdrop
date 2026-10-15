import { requireUser } from "@/lib/auth/requireUser";
import { getSettings } from "@/lib/db/settings";
import { json, route } from "@/lib/http";
import { getDevices } from "@/lib/spotify/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const { userId } = await requireUser(req);
  const [devices, settings] = await Promise.all([getDevices(userId), getSettings(userId)]);
  return json({ devices, linkedDeviceId: settings.deviceId, linkedDeviceName: settings.deviceName });
});
