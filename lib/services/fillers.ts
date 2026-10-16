import { getUserById } from "@/lib/db/users";
import { AppError } from "@/lib/errors";
import type { Filler } from "@/lib/logic/segue";
import { getLikedFillers, getPlaylistFillers } from "@/lib/spotify/client";
import { hasRestScopes } from "@/lib/spotify/oauth";
import type { Drop, RestSource } from "@/lib/types";

function otherDropsOf(drop: Drop, enabledDrops: Drop[]): Filler[] {
  return enabledDrops.filter((d) => d.id !== drop.id).map((d) => ({ uri: d.trackUri, durationMs: d.durationMs }));
}

/**
 * Backup music (spec §11.5), best first: the rest source (default Liked Songs) minus every
 * tagged song (so drops aren't spoiled), else the user's other tagged songs. Source `tagged`
 * means only those. Without the library scopes, the tagged songs; with none of those either,
 * PLAYLIST_ACCESS_REQUIRED.
 */
export async function loadFillers(
  userId: string,
  source: RestSource | null,
  drop: Drop,
  enabledDrops: Drop[],
): Promise<Filler[]> {
  const otherDrops = otherDropsOf(drop, enabledDrops);
  if (source?.kind === "tagged") return otherDrops;
  const user = await getUserById(userId);
  if (!hasRestScopes(user?.scopes ?? null)) {
    if (otherDrops.length > 0) return otherDrops;
    throw new AppError("PLAYLIST_ACCESS_REQUIRED");
  }

  const effective = source ?? ({ kind: "liked" } as const);
  const fromSource =
    effective.kind === "liked" ? await getLikedFillers(userId) : await getPlaylistFillers(userId, effective.id);
  const tagged = new Set(enabledDrops.map((d) => d.trackId));
  tagged.add(drop.trackId);
  const untagged = fromSource.filter((f) => !tagged.has(f.trackId));
  return untagged.length > 0 ? untagged : otherDrops;
}

/**
 * Like `loadFillers`, for music that's nice to have (what plays after a drop song) rather
 * than needed: any failure falls back to the other tagged songs instead of blocking playback.
 */
export async function loadFillersBestEffort(
  userId: string,
  source: RestSource | null,
  drop: Drop,
  enabledDrops: Drop[],
): Promise<Filler[]> {
  try {
    return await loadFillers(userId, source, drop, enabledDrops);
  } catch (err) {
    console.warn("[fillers] falling back to tagged songs:", err instanceof Error ? err.message : err);
    return otherDropsOf(drop, enabledDrops);
  }
}
