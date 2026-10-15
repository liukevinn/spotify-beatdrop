import { check, db, nowIso, unwrap, unwrapMaybe } from "@/lib/db/client";
import type { QueueMode, Settings } from "@/lib/types";

interface SettingsRow {
  lead_ms: number;
  reaction_offset_ms: number;
  queue_mode: QueueMode;
  avoid_repeat_within: number;
  device_id: string | null;
  device_name: string | null;
}

const COLUMNS = "lead_ms, reaction_offset_ms, queue_mode, avoid_repeat_within, device_id, device_name";

function toSettings(row: SettingsRow): Settings {
  return {
    leadMs: row.lead_ms,
    reactionOffsetMs: row.reaction_offset_ms,
    queueMode: row.queue_mode,
    avoidRepeatWithin: row.avoid_repeat_within,
    deviceId: row.device_id,
    deviceName: row.device_name,
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
  if (patch.reactionOffsetMs !== undefined) row.reaction_offset_ms = patch.reactionOffsetMs;
  if (patch.queueMode !== undefined) row.queue_mode = patch.queueMode;
  if (patch.avoidRepeatWithin !== undefined) row.avoid_repeat_within = patch.avoidRepeatWithin;
  if (patch.deviceId !== undefined) row.device_id = patch.deviceId;
  if (patch.deviceName !== undefined) row.device_name = patch.deviceName;

  const res = await db().from("settings").update(row).eq("user_id", userId).select(COLUMNS).single<SettingsRow>();
  return toSettings(unwrap(res, "updateSettings"));
}
