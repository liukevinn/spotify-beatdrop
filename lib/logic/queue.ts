import type { QueueMode } from "@/lib/types";

/** Sets older than this don't count toward repeat avoidance. */
export const REPEAT_WINDOW_MS = 4 * 60 * 60 * 1000;

export interface QueueDrop {
  id: string;
  trackId: string;
}

export interface QueueSet {
  trackId: string;
}

export interface SelectNextDropInput<D extends QueueDrop> {
  /** The user's enabled drops, ordered by sort_order. */
  enabledDrops: D[];
  /** Sets within the repeat window, newest first, at most `avoidRepeatWithin` of them. */
  recentSets: QueueSet[];
  /** The most recent set at any time (drives sequential mode). */
  lastSet: QueueSet | null;
  queueMode: QueueMode;
  forcedDropId?: string;
  /** Returns a float in [0, 1). Injectable for tests. */
  random?: () => number;
}

/** Picks the next drop to cue. Returns null when there are no enabled drops. */
export function selectNextDrop<D extends QueueDrop>(input: SelectNextDropInput<D>): D | null {
  const { enabledDrops: candidates, recentSets, lastSet, queueMode, forcedDropId, random = Math.random } = input;

  if (forcedDropId) {
    const forced = candidates.find((d) => d.id === forcedDropId);
    if (forced) return forced;
  }
  if (candidates.length === 0) return null;

  const excluded = new Set(recentSets.map((s) => s.trackId));
  let pool = candidates.filter((d) => !excluded.has(d.trackId));
  if (pool.length === 0) pool = candidates.filter((d) => d.trackId !== recentSets[0]?.trackId);
  if (pool.length === 0) pool = candidates;

  if (queueMode === "shuffle") {
    const index = Math.min(Math.floor(random() * pool.length), pool.length - 1);
    return pool[index] ?? null;
  }

  const inPool = new Set(pool.map((d) => d.id));
  const lastIdx = lastSet ? candidates.findIndex((d) => d.trackId === lastSet.trackId) : -1;
  for (let step = 1; step <= candidates.length; step++) {
    const drop = candidates[(lastIdx + step) % candidates.length];
    if (drop && inPool.has(drop.id)) return drop;
  }
  return pool[0] ?? null;
}
