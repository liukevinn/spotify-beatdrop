import { requireUser } from "@/lib/auth/requireUser";
import { getSettings } from "@/lib/db/settings";
import { getUserById } from "@/lib/db/users";
import { json, route } from "@/lib/http";
import { hasRestScopes } from "@/lib/spotify/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const user = await requireUser(req, { allowNeedsReauth: true });
  const [settings, row] = await Promise.all([getSettings(user.userId), getUserById(user.userId)]);
  return json({
    displayName: user.displayName,
    needsReauth: user.needsReauth,
    deviceLinked: settings.deviceId !== null,
    playlistAccess: hasRestScopes(row?.scopes ?? null),
  });
});
