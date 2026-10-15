export interface PositionInput {
  dropMs: number;
  durationMs: number;
  leadMsOverride: number | null;
}

/**
 * Where to start playback so the drop lands `lead` ms later.
 * If the drop is earlier than the lead, playback starts at 0 and the reported
 * lead is the real (shorter) one.
 */
export function computeStartPosition(
  drop: PositionInput,
  settings: { leadMs: number },
): { positionMs: number; leadMs: number } {
  const leadMs = drop.leadMsOverride ?? settings.leadMs;
  const raw = drop.dropMs - leadMs;
  const positionMs = Math.min(Math.max(0, raw), Math.max(0, drop.durationMs - 1000));
  return { positionMs, leadMs: drop.dropMs - positionMs };
}
