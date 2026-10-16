import { getSettings } from "@/lib/db/settings";
import { getDropOrThrow, listDrops } from "@/lib/db/drops";
import { getLatestSet, insertSet, updateSetDrop } from "@/lib/db/sets";
import { AppError } from "@/lib/errors";
import { formatClock } from "@/lib/logic/format";
import { cutStartPosition, directStartPosition, planRest } from "@/lib/logic/segue";
import { clearUpNext, pickDropForSet } from "@/lib/services/cue";
import { loadFillers, loadFillersBestEffort } from "@/lib/services/fillers";
import { getCurrentlyPlaying } from "@/lib/spotify/client";
import { playQueueOnDevice } from "@/lib/spotify/playback";
import type { SetRecord, SetSource } from "@/lib/types";
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
  /** Backup music queued behind the drop song, so music continues after it. */
  afterUris: string[];
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

/** True when Spotify is playing something the rest should leave alone. Errors count as no. */
async function isMusicPlaying(userId: string): Promise<boolean> {
  try {
    const now = await getCurrentlyPlaying(userId);
    return now.kind === "local" || (now.kind === "track" && now.isPlaying);
  } catch {
    return false;
  }
}

/**
 * "Start rest" (spec §11.5): leaves whatever is playing alone (or starts backup music if
 * nothing is) and logs the set. The caller must run `pendingCut` (via `performCut`) after
 * responding, so the drop lands `restMs` after the tap.
 */
export async function startRest(
  userId: string,
  opts: { dropId?: string; restMs?: number; source: SetSource },
): Promise<RestResult> {
  const tappedAt = Date.now();
  const settings = await getSettings(userId);
  const restMs = opts.restMs ?? settings.restMs;
  const [picked, keepPlaying] = await Promise.all([
    pickDropForSet(userId, settings, opts.dropId),
    isMusicPlaying(userId),
  ]);
  const { drop } = picked;

  if (restMs - drop.dropMs > MAX_CUT_WAIT_MS) throw new AppError("REST_TOO_LONG");
  // Backup music is required only when nothing is playing and there's time to fill.
  const needsBackup = !keepPlaying && restMs > drop.dropMs;
  const fillers = needsBackup
    ? await loadFillers(userId, settings.restSource, drop, picked.enabledDrops)
    : await loadFillersBestEffort(userId, settings.restSource, drop, picked.enabledDrops);
  const plan = planRest({ restMs, drop, fillers, keepPlaying });
  if (!plan) throw new AppError("NO_FILLER");

  if (plan.kind === "direct") {
    await playQueueOnDevice(userId, { uris: [drop.trackUri, ...plan.afterUris], name: drop.trackName }, () =>
      directStartPosition(plan, Date.now() - tappedAt),
    );
  } else if (plan.fillerUris.length > 0) {
    await playQueueOnDevice(userId, { uris: plan.fillerUris, name: "your rest music" }, () => 0);
  }

  const set = await insertSet(userId, {
    dropId: drop.id,
    trackId: drop.trackId,
    trackName: drop.trackName,
    // Where the drop song itself starts: 0 when the cut leads into it.
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
            afterUris: plan.afterUris,
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
 * same drop moment. The music keeps playing; only the cut moves. The old cut sees the set's
 * track change and stands down.
 */
export async function swapRest(userId: string, dropId: string): Promise<SwapResult> {
  const swappedAt = Date.now();
  const latest = await getLatestSet(userId);
  const dropAt = latest ? Date.parse(latest.cuedAt) + latest.leadMs : 0;
  if (!latest || dropAt - swappedAt < 1000) throw new AppError("NO_ACTIVE_REST");

  const [drop, settings, enabledDrops] = await Promise.all([
    getDropOrThrow(userId, dropId),
    getSettings(userId),
    listDrops(userId, { enabledOnly: true }),
  ]);
  const remainingMs = dropAt - swappedAt;
  const fillers = await loadFillersBestEffort(userId, settings.restSource, drop, enabledDrops);
  const plan = planRest({ restMs: remainingMs, drop, fillers, keepPlaying: true })!;

  const result = (set: SetRecord, pendingCut: PendingCut | null): SwapResult => ({
    ok: true,
    set,
    track: { name: drop.trackName, artists: drop.artists },
    dropAt: new Date(dropAt).toISOString(),
    message: `⇄ ${drop.trackName} — drop in ${formatClock(remainingMs)}`,
    pendingCut,
  });
  const logSwap = (positionMs: number) =>
    updateSetDrop(userId, latest.id, { dropId: drop.id, trackId: drop.trackId, trackName: drop.trackName, positionMs });

  // Too little time left for the new song's build-up: start it partway in, right now.
  if (plan.kind === "direct") {
    const set = await logSwap(plan.positionMs);
    await playQueueOnDevice(userId, { uris: [drop.trackUri, ...plan.afterUris], name: drop.trackName }, () =>
      directStartPosition(plan, Date.now() - swappedAt),
    );
    return result(set, null);
  }

  return result(await logSwap(0), {
    setId: latest.id,
    trackId: drop.trackId,
    drop: { uri: drop.trackUri, name: drop.trackName },
    afterUris: plan.afterUris,
    cutAt: dropAt - drop.dropMs,
  });
}

/**
 * Waits until `cut.cutAt`, then starts the drop song from 0:00 (or as far in as the cut
 * is late), with backup music queued behind it. Skips it if a newer set replaced this
 * rest, the rest was swapped, or the user paused. Never throws.
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
    await playQueueOnDevice(userId, { uris: [cut.drop.uri, ...cut.afterUris], name: cut.drop.name }, () =>
      cutStartPosition(cut.cutAt, clock.now()),
    );
    return "played";
  } catch (err) {
    console.error("[rest] cut failed:", err instanceof Error ? err.message : err);
    return "failed";
  }
}
