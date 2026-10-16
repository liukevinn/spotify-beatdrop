/**
 * Rest planning (spec §11.5).
 *
 * During a rest DropSet leaves the user's music alone. At `tap + (rest - drop_ms)` the server
 * cuts to the drop song from 0:00, so the drop lands exactly `rest` after the tap. Only when
 * nothing is playing does it start backup music. When the rest is shorter than the build-up,
 * the drop song just starts partway in.
 *
 * Whenever DropSet starts a drop song, backup music is queued behind it, so music keeps going
 * after the drop song ends and into the next rest (a silent player at cut time reads as
 * "paused", and the cut would stand down).
 */

export interface Filler {
  uri: string;
  durationMs: number;
}

export interface RestInput {
  restMs: number;
  drop: { trackUri: string; dropMs: number; durationMs: number };
  /** Backup music, already filtered (no drop songs, no local files). May be empty. */
  fillers: Filler[];
  /** Something is playing right now, so the rest keeps it instead of starting backup music. */
  keepPlaying: boolean;
  /** Returns a float in [0, 1). Injectable for tests. */
  random?: () => number;
}

export type RestPlan =
  /** Rest ≤ build-up: play `[drop, ...afterUris]` now, the drop song from `positionMs`. */
  | { kind: "direct"; positionMs: number; durationMs: number; afterUris: string[] }
  /**
   * Play `fillerUris` from 0:00 now (empty = keep what's playing), then after `cutAfterMs`
   * cut to `[drop, ...afterUris]`.
   */
  | { kind: "timed"; fillerUris: string[]; cutAfterMs: number; afterUris: string[] };

/** Fillers shorter than this are skipped (intros, skits). */
export const MIN_FILLER_MS = 30_000;
/**
 * Every filler is counted this much shorter, in case the user's Spotify crossfade (max 12 s)
 * shortens each hand-off, so queued music never runs out early.
 */
const FILLER_SLACK_MS = 12_000;
/** Music queued behind a drop song: the rest of the set plus the next rest, generously. */
export const AFTER_DROP_MUSIC_MS = 12 * 60_000;
/** Hard cap on queue length, in case of a tiny pool. */
const MAX_FILLERS = 20;

function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(Math.floor(random() * (i + 1)), i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Random songs (cycling through the pool if it's small) that outlast `coverMs`. */
function drawFillers(pool: Filler[], coverMs: number, random: () => number): string[] {
  const uris: string[] = [];
  if (pool.length === 0) return uris;
  let covered = 0;
  let order = shuffled(pool, random);
  while (covered < coverMs + FILLER_SLACK_MS && uris.length < MAX_FILLERS) {
    if (order.length === 0) order = shuffled(pool, random);
    const next = order.shift()!;
    uris.push(next.uri);
    covered += next.durationMs - FILLER_SLACK_MS;
  }
  return uris;
}

function usableFillers(fillers: Filler[], dropUri: string): Filler[] {
  return fillers.filter((f) => f.uri !== dropUri && f.durationMs >= MIN_FILLER_MS);
}

/** Backup music to queue behind a drop song (for cues that aren't part of a rest). */
export function musicAfterDrop(fillers: Filler[], dropUri: string, random: () => number = Math.random): string[] {
  return drawFillers(usableFillers(fillers, dropUri), AFTER_DROP_MUSIC_MS, random);
}

/** Returns null only when backup music is needed right now and there is none. */
export function planRest(input: RestInput): RestPlan | null {
  const { restMs, drop, keepPlaying, random = Math.random } = input;
  const cutAfterMs = restMs - drop.dropMs;
  const pool = usableFillers(input.fillers, drop.trackUri);
  const afterUris = drawFillers(pool, AFTER_DROP_MUSIC_MS, random);

  if (cutAfterMs <= 0) {
    return { kind: "direct", positionMs: drop.dropMs - restMs, durationMs: drop.durationMs, afterUris };
  }
  if (keepPlaying) return { kind: "timed", fillerUris: [], cutAfterMs, afterUris };

  // Nothing playing: backup music covers the whole rest, so a swap can move the cut later.
  if (pool.length === 0) return null;
  return { kind: "timed", fillerUris: drawFillers(pool, restMs, random), cutAfterMs, afterUris };
}

/**
 * Start position for a direct rest, later by the time already spent since the tap
 * so the drop stays anchored to it. Never seeks into the last second.
 */
export function directStartPosition(plan: { positionMs: number; durationMs: number }, elapsedMs: number): number {
  return Math.max(0, Math.min(plan.positionMs + Math.max(0, elapsedMs), plan.durationMs - 1000));
}

/** Where the drop song starts at the cut: 0, or however late the cut fired. */
export function cutStartPosition(cutAt: number, now: number): number {
  return Math.max(0, now - cutAt);
}
