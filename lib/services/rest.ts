import { getSettings } from "@/lib/db/settings";
import { getDropOrThrow, listDrops } from "@/lib/db/drops";
import { getLatestSet, insertSet, updateSetDrop } from "@/lib/db/sets";
import { getUserById } from "@/lib/db/users";
import { AppError } from "@/lib/errors";
import { formatClock } from "@/lib/logic/format";
import { cutStartPosition, directStartPosition, planRest, type Filler } from "@/lib/logic/segue";
import { clearUpNext, pickDropForSet } from "@/lib/services/cue";
import { getCurrentlyPlaying, getLikedFillers, getPlaylistFillers } from "@/lib/spotify/client";
import { hasRestScopes } from "@/lib/spotify/oauth";
import { playQueueOnDevice } from "@/lib/spotify/playback";
import type { Drop, RestSource, SetRecord, SetSource } from "@/lib/types";
import { sleep } from "@/lib/utils";

/**
 * Longest wait before the cut that one function invocation can hold. Vercel Hobby caps
 * functions at 300 s; this leaves room for the work before and after the wait.
 */
export const MAX_CUT_WAIT_MS = 285_000;
/** Check the player this long before the cut, so the check's latency doesn't delay it. */
const PRE_CUT_CHECK_MS = 2_000;

/** A cut to the drop song that the route runs after responding (spec §11.5). */
export interface PendingCut {
  setId: string;
  /** The set's drop must still be this track when the cut fires (a swap changes it). */
  trackId: string;
  drop: { uri: string; name: string };
  /** Epoch ms when the drop song must start from 0:00. */
  cutAt: number;
}

export interface RestResult {
  ok: true;
  set: SetRecord;
  track: { name: string; artists: string };
  restMs: number;
  /** When the drop should hit (ISO). Drives the countdown. */
  dropAt: string;
  message: string;
  /** Present when rest music is playing and the cut still has to happen. */
  pendingCut: PendingCut | null;
}

/**
 * Filler candidates, best first: the rest source minus every tagged song (so drops aren't
 * spoiled), else the user's other tagged songs. With no source set, the tagged songs.
 */
async function loadFillers(userId: string, source: RestSource | null, drop: Drop, enabledDrops: Drop[]): Promise<Filler[]> {
  const otherDrops = enabledDrops
    .filter((d) => d.id !== drop.id)
    .map((d) => ({ uri: d.trackUri, durationMs: d.durationMs }));
  if (!source) return otherDrops;

  const user = await getUserById(userId);
  if (!hasRestScopes(user?.scopes ?? null)) throw new AppError("PLAYLIST_ACCESS_REQUIRED");

  const fromSource =
    source.kind === "liked" ? await getLikedFillers(userId) : await getPlaylistFillers(userId, source.id);
  const tagged = new Set(enabledDrops.map((d) => d.trackId));
  tagged.add(drop.trackId);
  const untagged = fromSource.filter((f) => !tagged.has(f.trackId));
  return untagged.length > 0 ? untagged : otherDrops;
}

/**
 * "Start rest" (spec §11.5): starts rest music now and logs the set. The caller must run
 * `pendingCut` (via `performCut`) after responding, so the drop lands `restMs` after the tap.
 */
export async function startRest(
  userId: string,
  opts: { dropId?: string; restMs?: number; source: SetSource },
): Promise<RestResult> {
  const tappedAt = Date.now();
  const settings = await getSettings(userId);
  const restMs = opts.restMs ?? settings.restMs;
  const picked = await pickDropForSet(userId, settings, opts.dropId);
  const { drop } = picked;

  if (restMs - drop.dropMs > MAX_CUT_WAIT_MS) throw new AppError("REST_TOO_LONG");
  const fillers = restMs > drop.dropMs ? await loadFillers(userId, settings.restSource, drop, picked.enabledDrops) : [];
  const plan = planRest({ restMs, drop, fillers });
  if (!plan) throw new AppError("NO_FILLER");

  if (plan.kind === "direct") {
    await playQueueOnDevice(userId, { uris: [drop.trackUri], name: drop.trackName }, () =>
      directStartPosition(plan, Date.now() - tappedAt),
    );
  } else {
    await playQueueOnDevice(userId, { uris: plan.fillerUris, name: "your rest music" }, () => 0);
  }

  const set = await insertSet(userId, {
    dropId: drop.id,
    trackId: drop.trackId,
    trackName: drop.trackName,
    // Where the drop song itself starts: 0 when rest music leads into it.
    positionMs: plan.kind === "direct" ? plan.positionMs : 0,
    leadMs: restMs,
    source: opts.source,
    cuedAt: new Date(tappedAt).toISOString(),
  });
  await clearUpNext(userId, picked);

  return {
    ok: true,
    set,
    track: { name: drop.trackName, artists: drop.artists },
    restMs,
    dropAt: new Date(tappedAt + restMs).toISOString(),
    message: `⏱ ${formatClock(restMs)} rest → ${drop.trackName}`,
    pendingCut:
      plan.kind === "timed"
        ? {
            setId: set.id,
            trackId: drop.trackId,
            drop: { uri: drop.trackUri, name: drop.trackName },
            cutAt: tappedAt + plan.cutAfterMs,
          }
        : null,
  };
}

export type CutOutcome = "played" | "superseded" | "paused" | "failed";

export interface SwapResult {
  ok: true;
  set: SetRecord;
  track: { name: string; artists: string };
  dropAt: string;
  message: string;
  pendingCut: PendingCut | null;
}

/**
 * "Swap song" (spec §11.5): changes the drop song of the running rest while keeping the
 * same drop moment. The old cut sees the set's track change and stands down.
 */
export async function swapRest(userId: string, dropId: string): Promise<SwapResult> {
  const swappedAt = Date.now();
  const latest = await getLatestSet(userId);
  const dropAt = latest ? Date.parse(latest.cuedAt) + latest.leadMs : 0;
  if (!latest || dropAt - swappedAt < 1000) throw new AppError("NO_ACTIVE_REST");

  const drop = await getDropOrThrow(userId, dropId);
  const remainingMs = dropAt - swappedAt;
  const result = (set: SetRecord, pendingCut: PendingCut | null): SwapResult => ({
    ok: true,
    set,
    track: { name: drop.trackName, artists: drop.artists },
    dropAt: new Date(dropAt).toISOString(),
    message: `⇄ ${drop.trackName} — drop in ${formatClock(remainingMs)}`,
    pendingCut,
  });
  const cutFor = (setId: string): PendingCut => ({
    setId,
    trackId: drop.trackId,
    drop: { uri: drop.trackUri, name: drop.trackName },
    cutAt: dropAt - drop.dropMs,
  });
  const logSwap = (positionMs: number) =>
    updateSetDrop(userId, latest.id, { dropId: drop.id, trackId: drop.trackId, trackName: drop.trackName, positionMs });

  // Too little time left for the new song's build-up: start it partway in, right now.
  if (remainingMs <= drop.dropMs) {
    const plan = { positionMs: drop.dropMs - remainingMs, durationMs: drop.durationMs };
    const set = await logSwap(plan.positionMs);
    await playQueueOnDevice(userId, { uris: [drop.trackUri], name: drop.trackName }, () =>
      directStartPosition(plan, Date.now() - swappedAt),
    );
    return result(set, null);
  }

  // Rest music is still playing (it covers the whole rest): just move the cut.
  const now = await getCurrentlyPlaying(userId);
  const oldDropPlaying = now.kind === "track" && now.track.id === latest.trackId;
  if (!oldDropPlaying) return result(await logSwap(0), cutFor(latest.id));

  // The old drop song already started: bring rest music back, then cut to the new song.
  const [settings, enabledDrops] = await Promise.all([getSettings(userId), listDrops(userId, { enabledOnly: true })]);
  const fillers = await loadFillers(userId, settings.restSource, drop, enabledDrops);
  const plan = planRest({ restMs: remainingMs, drop, fillers });
  if (!plan || plan.kind !== "timed") throw new AppError("NO_FILLER");
  await playQueueOnDevice(userId, { uris: plan.fillerUris, name: "your rest music" }, () => 0);
  return result(await logSwap(0), cutFor(latest.id));
}

/**
 * Waits until `cut.cutAt`, then starts the drop song from 0:00 (or as far in as the cut
 * is late). Skips it if a newer set replaced this rest or the user paused. Never throws.
 */
export async function performCut(
  userId: string,
  cut: PendingCut,
  clock: { now: () => number; sleep: (ms: number) => Promise<void> } = { now: Date.now, sleep },
): Promise<CutOutcome> {
  try {
    await clock.sleep(Math.max(0, cut.cutAt - PRE_CUT_CHECK_MS - clock.now()));

    const [latest, playing] = await Promise.all([getLatestSet(userId), getCurrentlyPlaying(userId)]);
    if (latest?.id !== cut.setId || latest.trackId !== cut.trackId) return "superseded";
    if (playing.kind === "track" && !playing.isPlaying) return "paused";

    await clock.sleep(Math.max(0, cut.cutAt - clock.now()));
    await playQueueOnDevice(userId, { uris: [cut.drop.uri], name: cut.drop.name }, () =>
      cutStartPosition(cut.cutAt, clock.now()),
    );
    return "played";
  } catch (err) {
    console.error("[rest] cut failed:", err instanceof Error ? err.message : err);
    return "failed";
  }
}
