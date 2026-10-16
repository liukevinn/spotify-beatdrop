import { requireUser } from "@/lib/auth/requireUser";
import { getDrop } from "@/lib/db/drops";
import { getSettings, updateSettings } from "@/lib/db/settings";
import { AppError } from "@/lib/errors";
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
  if (patch.nextDropId && !(await getDrop(userId, patch.nextDropId))) {
    throw new AppError("NOT_FOUND", "That drop no longer exists.");
  }
  return json(await updateSettings(userId, patch));
});
