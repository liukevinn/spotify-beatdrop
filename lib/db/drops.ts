import { check, db, nowIso, unwrap, unwrapMaybe } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import type { Drop, TrackInfo } from "@/lib/types";

interface DropRow {
  id: string;
  track_id: string;
  track_uri: string;
  track_name: string;
  artists: string;
  album_art_url: string | null;
  duration_ms: number;
  drop_ms: number;
  lead_ms_override: number | null;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  "id, track_id, track_uri, track_name, artists, album_art_url, duration_ms, drop_ms, lead_ms_override, enabled, sort_order, created_at, updated_at";

function toDrop(row: DropRow): Drop {
  return {
    id: row.id,
    trackId: row.track_id,
    trackUri: row.track_uri,
    trackName: row.track_name,
    artists: row.artists,
    albumArtUrl: row.album_art_url,
    durationMs: row.duration_ms,
    dropMs: row.drop_ms,
    leadMsOverride: row.lead_ms_override,
    enabled: row.enabled,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listDrops(userId: string, opts: { enabledOnly?: boolean } = {}): Promise<Drop[]> {
  let query = db().from("drops").select(COLUMNS).eq("user_id", userId);
  if (opts.enabledOnly) query = query.eq("enabled", true);
  const res = await query.order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  return unwrap(res, "listDrops").map((r) => toDrop(r as DropRow));
}

export async function getDrop(userId: string, dropId: string): Promise<Drop | null> {
  const res = await db()
    .from("drops")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("id", dropId)
    .maybeSingle<DropRow>();
  const row = unwrapMaybe(res, "getDrop");
  return row ? toDrop(row) : null;
}

export async function getDropOrThrow(userId: string, dropId: string): Promise<Drop> {
  const drop = await getDrop(userId, dropId);
  if (!drop) throw new AppError("NOT_FOUND", "That drop no longer exists.");
  return drop;
}

export async function findDropByTrack(userId: string, trackId: string): Promise<Drop | null> {
  const res = await db()
    .from("drops")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("track_id", trackId)
    .maybeSingle<DropRow>();
  const row = unwrapMaybe(res, "findDropByTrack");
  return row ? toDrop(row) : null;
}

async function nextSortOrder(userId: string): Promise<number> {
  const res = await db()
    .from("drops")
    .select("sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>();
  const row = unwrapMaybe(res, "nextSortOrder");
  return row ? row.sort_order + 1 : 0;
}

/** Creates a drop for the track, or overwrites the existing one and refreshes its metadata. */
export async function saveMarkedDrop(
  userId: string,
  track: TrackInfo,
  dropMs: number,
): Promise<{ drop: Drop; created: boolean }> {
  const metadata = {
    track_uri: track.uri,
    track_name: track.name,
    artists: track.artists,
    album_art_url: track.albumArtUrl,
    duration_ms: track.durationMs,
    drop_ms: dropMs,
    updated_at: nowIso(),
  };

  const existing = await findDropByTrack(userId, track.id);
  if (existing) {
    const res = await db()
      .from("drops")
      .update(metadata)
      .eq("user_id", userId)
      .eq("id", existing.id)
      .select(COLUMNS)
      .single<DropRow>();
    return { drop: toDrop(unwrap(res, "saveMarkedDrop.update")), created: false };
  }

  const res = await db()
    .from("drops")
    .insert({ ...metadata, user_id: userId, track_id: track.id, sort_order: await nextSortOrder(userId) })
    .select(COLUMNS)
    .single<DropRow>();
  return { drop: toDrop(unwrap(res, "saveMarkedDrop.insert")), created: true };
}

export interface DropPatch {
  dropMs?: number;
  enabled?: boolean;
  leadMsOverride?: number | null;
}

export async function updateDrop(userId: string, dropId: string, patch: DropPatch): Promise<Drop> {
  const row: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.dropMs !== undefined) row.drop_ms = patch.dropMs;
  if (patch.enabled !== undefined) row.enabled = patch.enabled;
  if (patch.leadMsOverride !== undefined) row.lead_ms_override = patch.leadMsOverride;

  const res = await db()
    .from("drops")
    .update(row)
    .eq("user_id", userId)
    .eq("id", dropId)
    .select(COLUMNS)
    .maybeSingle<DropRow>();
  const updated = unwrapMaybe(res, "updateDrop");
  if (!updated) throw new AppError("NOT_FOUND", "That drop no longer exists.");
  return toDrop(updated);
}

export async function deleteDrop(userId: string, dropId: string): Promise<void> {
  const res = await db().from("drops").delete().eq("user_id", userId).eq("id", dropId).select("id");
  if (unwrap(res, "deleteDrop").length === 0) throw new AppError("NOT_FOUND", "That drop no longer exists.");
}

/** Rewrites `sort_order` to match `ids`. Every id must belong to the user. */
export async function reorderDrops(userId: string, ids: string[]): Promise<void> {
  const owned = new Set((await listDrops(userId)).map((d) => d.id));
  if (!ids.every((id) => owned.has(id))) throw new AppError("NOT_FOUND", "Some drops no longer exist.");

  const updatedAt = nowIso();
  const results = await Promise.all(
    ids.map((id, index) =>
      db().from("drops").update({ sort_order: index, updated_at: updatedAt }).eq("user_id", userId).eq("id", id),
    ),
  );
  results.forEach((res) => check(res, "reorderDrops"));
}
