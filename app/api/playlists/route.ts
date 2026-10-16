import { requireUser } from "@/lib/auth/requireUser";
import { getUserById } from "@/lib/db/users";
import { AppError } from "@/lib/errors";
import { json, route } from "@/lib/http";
import { getMyPlaylists } from "@/lib/spotify/client";
import { hasRestScopes } from "@/lib/spotify/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Rest-source candidates: playlists the user owns or collaborates on (spec §11.5). */
export const GET = route(async (req) => {
  const { userId } = await requireUser(req);
  const user = await getUserById(userId);
  if (!user || !hasRestScopes(user.scopes)) throw new AppError("PLAYLIST_ACCESS_REQUIRED");
  return json({ playlists: await getMyPlaylists(userId, user.spotify_user_id) });
});
