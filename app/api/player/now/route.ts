import { requireUser } from "@/lib/auth/requireUser";
import { findDropByTrack } from "@/lib/db/drops";
import { json, route } from "@/lib/http";
import { getCurrentlyPlaying } from "@/lib/spotify/client";
import type { NowPlaying } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const { userId } = await requireUser(req);
  const now = await getCurrentlyPlaying(userId);
  if (now.kind !== "track") return json<NowPlaying>({ playing: false });

  const { id, name, artists, albumArtUrl, durationMs } = now.track;
  const drop = await findDropByTrack(userId, id);
  return json<NowPlaying>({
    playing: true,
    track: { id, name, artists, albumArtUrl, durationMs },
    progressMs: now.progressMs,
    isPlaying: now.isPlaying,
    drop: drop ? { id: drop.id, dropMs: drop.dropMs } : null,
  });
});
