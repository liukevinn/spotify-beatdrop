export const NUDGE_DELTAS = [-1000, -250, 250, 1000] as const;
export type NudgeDelta = (typeof NUDGE_DELTAS)[number];

/** Test playback starts this far before the drop. */
export const TEST_PREROLL_MS = 3000;

/** Drop time for a mark: the current position minus the user's reaction time, never negative. */
export function computeMarkedDropMs(progressMs: number, reactionOffsetMs: number): number {
  return Math.max(0, progressMs - reactionOffsetMs);
}

/** Applies a nudge, clamped to `[0, durationMs - 1]`. */
export function nudgeDropMs(dropMs: number, deltaMs: number, durationMs: number): number {
  return Math.min(Math.max(0, dropMs + deltaMs), Math.max(0, durationMs - 1));
}

export function testStartMs(dropMs: number): number {
  return Math.max(0, dropMs - TEST_PREROLL_MS);
}
