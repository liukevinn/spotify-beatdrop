import { db, unwrap } from "@/lib/db/client";
import type { SetRecord, SetSource } from "@/lib/types";

interface SetRow {
  id: string;
  drop_id: string | null;
  track_id: string;
  track_name: string;
  cued_at: string;
  position_ms: number;
  lead_ms: number;
  source: SetSource;
}

const COLUMNS = "id, drop_id, track_id, track_name, cued_at, position_ms, lead_ms, source";

function toSet(row: SetRow): SetRecord {
  return {
    id: row.id,
    dropId: row.drop_id,
    trackId: row.track_id,
    trackName: row.track_name,
    cuedAt: row.cued_at,
    positionMs: row.position_ms,
    leadMs: row.lead_ms,
    source: row.source,
  };
}

export interface NewSet {
  dropId: string;
  trackId: string;
  trackName: string;
  positionMs: number;
  leadMs: number;
  source: SetSource;
}

export async function insertSet(userId: string, set: NewSet): Promise<SetRecord> {
  const res = await db()
    .from("sets")
    .insert({
      user_id: userId,
      drop_id: set.dropId,
      track_id: set.trackId,
      track_name: set.trackName,
      position_ms: set.positionMs,
      lead_ms: set.leadMs,
      source: set.source,
    })
    .select(COLUMNS)
    .single<SetRow>();
  return toSet(unwrap(res, "insertSet"));
}

/** Newest first. `since` (ISO) optionally limits to sets cued after that time. */
export async function listSets(userId: string, opts: { limit: number; since?: string }): Promise<SetRecord[]> {
  if (opts.limit <= 0) return [];
  let query = db().from("sets").select(COLUMNS).eq("user_id", userId);
  if (opts.since) query = query.gt("cued_at", opts.since);
  const res = await query.order("cued_at", { ascending: false }).limit(opts.limit);
  return unwrap(res, "listSets").map((r) => toSet(r as SetRow));
}

export async function getLatestSet(userId: string): Promise<SetRecord | null> {
  const [latest] = await listSets(userId, { limit: 1 });
  return latest ?? null;
}
