import { listDrops } from "@/lib/db/drops";
import { getSettings } from "@/lib/db/settings";
import { getLatestSet, insertSet, listSets } from "@/lib/db/sets";
import { AppError } from "@/lib/errors";
import { formatLeadSeconds } from "@/lib/logic/format";
import { computeStartPosition } from "@/lib/logic/position";
import { REPEAT_WINDOW_MS, selectNextDrop } from "@/lib/logic/queue";
import { playOnDevice } from "@/lib/spotify/playback";
import type { SetRecord, SetSource } from "@/lib/types";

export interface CueResult {
  ok: true;
  set: SetRecord;
  track: { name: string; artists: string };
  leadMs: number;
  message: string;
}

/** Picks the next drop, starts it `lead` before the drop, and logs the set (spec §9.2 Cue). */
export async function cueNextSet(userId: string, opts: { dropId?: string; source: SetSource }): Promise<CueResult> {
  const settings = await getSettings(userId);
  const [enabledDrops, recentSets, lastSet] = await Promise.all([
    listDrops(userId, { enabledOnly: true }),
    listSets(userId, {
      limit: settings.avoidRepeatWithin,
      since: new Date(Date.now() - REPEAT_WINDOW_MS).toISOString(),
    }),
    getLatestSet(userId),
  ]);

  const drop = selectNextDrop({
    enabledDrops,
    recentSets,
    lastSet,
    queueMode: settings.queueMode,
    forcedDropId: opts.dropId,
  });
  if (!drop) throw new AppError("NO_DROPS");

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

  return {
    ok: true,
    set,
    track: { name: drop.trackName, artists: drop.artists },
    leadMs,
    message: `▶ ${drop.trackName} — drop in ${formatLeadSeconds(leadMs)}`,
  };
}
