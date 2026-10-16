/**
 * Rest planning (spec §11.5).
 *
 * Rest music plays from the start of each song. At `tap + (rest - drop_ms)` the server
 * cuts to the drop song from 0:00, so the drop lands exactly `rest` after the tap.
 * When the rest is shorter than the build-up, the drop song just starts partway in.
 *
 * Rest music is queued to outlast the whole rest (not just the cut), so "Swap song" can
 * move the cut anywhere up to the drop moment without the music running out.
 */

export interface Filler {
  uri: string;
  durationMs: number;
}

export interface RestInput {
  restMs: number;
  drop: { trackUri: string; dropMs: number; durationMs: number };
  /** Candidate fillers, already filtered (no drop songs, no local files). May be empty. */
  fillers: Filler[];
  /** Returns a float in [0, 1). Injectable for tests. */
  random?: () => number;
}

export type RestPlan =
  /** Rest ≤ build-up: play the drop song now from `positionMs`. */
  | { kind: "direct"; positionMs: number; durationMs: number }
  /** Play `fillerUris` from 0:00 now, then cut to the drop song after `cutAfterMs`. */
  | { kind: "timed"; fillerUris: string[]; cutAfterMs: number };

/** Fillers shorter than this are skipped (intros, skits). */
export const MIN_FILLER_MS = 30_000;
/**
 * Rest music must outlast the cut by this much, even if the user's Spotify crossfade
 * (max 12 s) shortens every hand-off, so it never runs out early.
 */
const FILLER_SLACK_MS = 12_000;
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

/** Returns null when there is filler time to cover but nothing usable to cover it with. */
export function planRest(input: RestInput): RestPlan | null {
  const { restMs, drop, random = Math.random } = input;
  const cutAfterMs = restMs - drop.dropMs;

  if (cutAfterMs <= 0) {
    return { kind: "direct", positionMs: drop.dropMs - restMs, durationMs: drop.durationMs };
  }

  const pool = input.fillers.filter((f) => f.uri !== drop.trackUri && f.durationMs >= MIN_FILLER_MS);
  if (pool.length === 0) return null;

  // Draw songs (cycling through the pool if it's small) until they outlast the rest.
  const fillerUris: string[] = [];
  let covered = 0;
  let order = shuffled(pool, random);
  while (covered < restMs + FILLER_SLACK_MS && fillerUris.length < MAX_FILLERS) {
    if (order.length === 0) order = shuffled(pool, random);
    const next = order.shift()!;
    fillerUris.push(next.uri);
    covered += next.durationMs - FILLER_SLACK_MS;
  }
  return { kind: "timed", fillerUris, cutAfterMs };
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
