import { check, db, nowIso, unwrap, unwrapMaybe } from "@/lib/db/client";
import type { QueueMode, RestSource, Settings } from "@/lib/types";

interface SettingsRow {
  lead_ms: number;
  queue_mode: QueueMode;
  avoid_repeat_within: number;
  device_id: string | null;
  device_name: string | null;
  rest_ms: number;
  rest_source: string | null;
  rest_source_name: string | null;
  next_drop_id: string | null;
}

const COLUMNS =
  "lead_ms, queue_mode, avoid_repeat_within, device_id, device_name, rest_ms, rest_source, rest_source_name, next_drop_id";

const LIKED = "liked";

function toRestSource(row: Pick<SettingsRow, "rest_source" | "rest_source_name">): RestSource | null {
  if (!row.rest_source) return null;
  if (row.rest_source === LIKED) return { kind: "liked" };
  return { kind: "playlist", id: row.rest_source, name: row.rest_source_name ?? "Playlist" };
}

function toSettings(row: SettingsRow): Settings {
  return {
    leadMs: row.lead_ms,
    queueMode: row.queue_mode,
    avoidRepeatWithin: row.avoid_repeat_within,
    deviceId: row.device_id,
    deviceName: row.device_name,
    restMs: row.rest_ms,
    restSource: toRestSource(row),
    nextDropId: row.next_drop_id,
  };
}

/** Creates the default settings row if it doesn't exist yet. */
export async function ensureSettings(userId: string): Promise<void> {
  const res = await db()
    .from("settings")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  check(res, "ensureSettings");
}

export async function getSettings(userId: string): Promise<Settings> {
  const res = await db().from("settings").select(COLUMNS).eq("user_id", userId).maybeSingle<SettingsRow>();
  const row = unwrapMaybe(res, "getSettings");
  if (row) return toSettings(row);
  // Self-heal: a user should always have a settings row.
  await ensureSettings(userId);
  return getSettings(userId);
}

export type SettingsPatch = Partial<Settings>;

export async function updateSettings(userId: string, patch: SettingsPatch): Promise<Settings> {
  const row: Partial<SettingsRow> & { updated_at: string } = { updated_at: nowIso() };
  if (patch.leadMs !== undefined) row.lead_ms = patch.leadMs;
  if (patch.queueMode !== undefined) row.queue_mode = patch.queueMode;
  if (patch.avoidRepeatWithin !== undefined) row.avoid_repeat_within = patch.avoidRepeatWithin;
  if (patch.deviceId !== undefined) row.device_id = patch.deviceId;
  if (patch.deviceName !== undefined) row.device_name = patch.deviceName;
  if (patch.restMs !== undefined) row.rest_ms = patch.restMs;
  if (patch.nextDropId !== undefined) row.next_drop_id = patch.nextDropId;
  if (patch.restSource !== undefined) {
    const source = patch.restSource;
    row.rest_source = source === null ? null : source.kind === "liked" ? LIKED : source.id;
    row.rest_source_name = source?.kind === "playlist" ? source.name : null;
  }

  const res = await db().from("settings").update(row).eq("user_id", userId).select(COLUMNS).single<SettingsRow>();
  return toSettings(unwrap(res, "updateSettings"));
}
