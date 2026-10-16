import { getDropOrThrow, saveMarkedDrop, updateDrop } from "@/lib/db/drops";
import { getLatestSet } from "@/lib/db/sets";
import { AppError } from "@/lib/errors";
import { nudgeDropMs, testStartMs } from "@/lib/logic/drop";
import { formatMs } from "@/lib/logic/format";
import { getCurrentlyPlaying } from "@/lib/spotify/client";
import { playOnDevice } from "@/lib/spotify/playback";
import type { Drop } from "@/lib/types";

/** Saves the drop for whatever is playing now, at the current position (spec §11.3). */
export async function markDrop(userId: string): Promise<{ drop: Drop; created: boolean; message: string }> {
  const now = await getCurrentlyPlaying(userId);
  if (now.kind === "nothing") throw new AppError("NOTHING_PLAYING");
  if (now.kind === "local") throw new AppError("UNSUPPORTED_TRACK");

  const { drop, created } = await saveMarkedDrop(userId, now.track, now.progressMs);
  return { drop, created, message: `Marked drop for ${drop.trackName} at ${formatMs(drop.dropMs)}` };
}

export async function nudgeDrop(userId: string, dropId: string, deltaMs: number): Promise<Drop> {
  const drop = await getDropOrThrow(userId, dropId);
  return updateDrop(userId, dropId, { dropMs: nudgeDropMs(drop.dropMs, deltaMs, drop.durationMs) });
}

/** Nudges the drop behind the most recent cue (the "Last cued" card / Nudge shortcut). */
export async function nudgeLastCued(userId: string, deltaMs: number): Promise<{ drop: Drop; message: string }> {
  const last = await getLatestSet(userId);
  if (!last) throw new AppError("NO_SETS");
  if (!last.dropId) throw new AppError("NOT_FOUND", "The last cued drop was deleted.");

  const drop = await nudgeDrop(userId, last.dropId, deltaMs);
  return { drop, message: `Adjusted ${drop.trackName} to ${formatMs(drop.dropMs)}` };
}

/** Plays a few seconds before the drop so the user can check it. Not logged as a set. */
export async function testDrop(userId: string, dropId: string): Promise<void> {
  const drop = await getDropOrThrow(userId, dropId);
  await playOnDevice(userId, { uri: drop.trackUri, name: drop.trackName }, testStartMs(drop.dropMs));
}
