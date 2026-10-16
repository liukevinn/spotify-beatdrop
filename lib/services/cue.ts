import { listDrops } from "@/lib/db/drops";
import { getSettings, updateSettings } from "@/lib/db/settings";
import { getLatestSet, insertSet, listSets } from "@/lib/db/sets";
import { AppError } from "@/lib/errors";
import { formatLeadSeconds } from "@/lib/logic/format";
import { computeStartPosition } from "@/lib/logic/position";
import { REPEAT_WINDOW_MS, selectNextDrop } from "@/lib/logic/queue";
import { playOnDevice } from "@/lib/spotify/playback";
import type { Drop, SetRecord, SetSource, Settings } from "@/lib/types";

export interface CueResult {
  ok: true;
  set: SetRecord;
  track: { name: string; artists: string };
  leadMs: number;
  message: string;
}

export interface PickedDrop {
  drop: Drop;
  enabledDrops: Drop[];
  /** True when the drop came from "Up next", which must be cleared once the set is logged. */
  fromUpNext: boolean;
}

/**
 * Chooses the drop for the next set: an explicit `dropId`, else "Up next", else the
 * queue mode (spec §11.2). A stale Up next (deleted or disabled drop) falls through.
 */
export async function pickDropForSet(userId: string, settings: Settings, dropId?: string): Promise<PickedDrop> {
  const [enabledDrops, recentSets, lastSet] = await Promise.all([
    listDrops(userId, { enabledOnly: true }),
    listSets(userId, {
      limit: settings.avoidRepeatWithin,
      since: new Date(Date.now() - REPEAT_WINDOW_MS).toISOString(),
    }),
    getLatestSet(userId),
  ]);

  const forcedDropId = dropId ?? settings.nextDropId ?? undefined;
  const drop = selectNextDrop({ enabledDrops, recentSets, lastSet, queueMode: settings.queueMode, forcedDropId });
  if (!drop) throw new AppError("NO_DROPS");
  return { drop, enabledDrops, fromUpNext: settings.nextDropId !== null && drop.id === settings.nextDropId };
}

/** Up next is one-shot: once its set is logged, the next one goes back to the queue mode. */
export async function clearUpNext(userId: string, picked: PickedDrop): Promise<void> {
  if (picked.fromUpNext) await updateSettings(userId, { nextDropId: null });
}

/** Picks the next drop, starts it `lead` before the drop, and logs the set (spec §9.2 Cue). */
export async function cueNextSet(userId: string, opts: { dropId?: string; source: SetSource }): Promise<CueResult> {
  const settings = await getSettings(userId);
  const picked = await pickDropForSet(userId, settings, opts.dropId);
  const { drop } = picked;

  const { positionMs, leadMs } = computeStartPosition(drop, settings);
  await playOnDevice(userId, { uri: drop.trackUri, name: drop.trackName }, positionMs);

  const set = await insertSet(userId, {
    dropId: drop.id,
    trackId: drop.trackId,
    trackName: drop.trackName,
    positionMs,
    leadMs,
    source: opts.source,
  });
  await clearUpNext(userId, picked);

  return {
    ok: true,
    set,
    track: { name: drop.trackName, artists: drop.artists },
    leadMs,
    message: `▶ ${drop.trackName} — drop in ${formatLeadSeconds(leadMs)}`,
  };
}
