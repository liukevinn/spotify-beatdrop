/**
 * Opt-in integration test for lib/db against a real Supabase (never production):
 *
 *   supabase start
 *   DB_INTEGRATION=1 SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<local secret key> npm run test:db
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashToken } from "@/lib/crypto";
import { db } from "@/lib/db/client";
import * as drops from "@/lib/db/drops";
import * as settings from "@/lib/db/settings";
import * as sets from "@/lib/db/sets";
import * as tokens from "@/lib/db/tokens";
import * as users from "@/lib/db/users";
import type { TrackInfo } from "@/lib/types";

const run = process.env.DB_INTEGRATION === "1";
const suffix = Math.random().toString(36).slice(2);

const track = (n: number): TrackInfo => ({
  id: `track-${suffix}-${n}`,
  uri: `spotify:track:${suffix}${n}`,
  name: `Song ${n}`,
  artists: "Artist",
  albumArtUrl: null,
  durationMs: 200000,
});

async function createUser(tag: string) {
  const user = await users.upsertUserFromLogin({
    spotifyUserId: `spotify-${tag}-${suffix}`,
    displayName: `User ${tag}`,
    refreshTokenEnc: "enc",
    accessToken: "access",
    accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    scopes: null,
  });
  await settings.ensureSettings(user.id);
  return user.id;
}

describe.skipIf(!run)("lib/db against Supabase", () => {
  let userId: string;
  let otherUserId: string;

  beforeAll(async () => {
    userId = await createUser("a");
    otherUserId = await createUser("b");
  });

  afterAll(async () => {
    await db().from("users").delete().in("id", [userId, otherUserId]);
  });

  it("upserts users by Spotify id and clears needs_reauth on login", async () => {
    await users.markNeedsReauth(userId);
    expect((await users.getUserById(userId))?.needs_reauth).toBe(true);

    const again = await users.upsertUserFromLogin({
      spotifyUserId: `spotify-a-${suffix}`,
      displayName: "Renamed",
      refreshTokenEnc: "enc2",
      accessToken: "access2",
      accessTokenExpiresAt: new Date().toISOString(),
      scopes: "user-read-playback-state",
    });
    expect(again.id).toBe(userId);
    const row = await users.getUserById(userId);
    expect(row).toMatchObject({ needs_reauth: false, display_name: "Renamed", refresh_token_enc: "enc2" });

    await users.saveAccessToken(userId, { accessToken: "a3", accessTokenExpiresAt: new Date().toISOString() });
    expect((await users.getUserById(userId))?.refresh_token_enc).toBe("enc2");
    await users.saveAccessToken(userId, {
      accessToken: "a4",
      accessTokenExpiresAt: new Date().toISOString(),
      refreshTokenEnc: "enc-rotated",
    });
    expect((await users.getUserById(userId))?.refresh_token_enc).toBe("enc-rotated");
  });

  it("creates default settings once and updates them", async () => {
    await settings.ensureSettings(userId); // idempotent
    expect(await settings.getSettings(userId)).toEqual({
      leadMs: 20000,
      queueMode: "shuffle",
      avoidRepeatWithin: 5,
      deviceId: null,
      deviceName: null,
    });
    const updated = await settings.updateSettings(userId, { leadMs: 30000, deviceId: "d1", deviceName: "iPhone" });
    expect(updated).toMatchObject({ leadMs: 30000, deviceId: "d1", deviceName: "iPhone" });
  });

  it("rejects out-of-range settings at the DB level too", async () => {
    await expect(settings.updateSettings(userId, { leadMs: 1000 })).rejects.toMatchObject({ code: "INTERNAL" });
  });

  it("marks drops: creates, then overwrites the same track, with increasing sort_order", async () => {
    const first = await drops.saveMarkedDrop(userId, track(1), 60000);
    expect(first.created).toBe(true);
    const second = await drops.saveMarkedDrop(userId, track(2), 30000);
    expect(second.drop.sortOrder).toBe(first.drop.sortOrder + 1);

    const remark = await drops.saveMarkedDrop(userId, { ...track(1), name: "Song 1 (renamed)" }, 61000);
    expect(remark).toMatchObject({
      created: false,
      drop: { id: first.drop.id, dropMs: 61000, trackName: "Song 1 (renamed)" },
    });
    expect(await drops.listDrops(userId)).toHaveLength(2);
    expect((await drops.findDropByTrack(userId, track(1).id))?.id).toBe(first.drop.id);
  });

  it("scopes every drop query by user", async () => {
    const [mine] = await drops.listDrops(userId);
    expect(await drops.getDrop(otherUserId, mine!.id)).toBeNull();
    await expect(drops.updateDrop(otherUserId, mine!.id, { enabled: false })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(drops.deleteDrop(otherUserId, mine!.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(drops.reorderDrops(otherUserId, [mine!.id])).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await drops.getDrop(userId, mine!.id)).not.toBeNull();
  });

  it("patches, filters, and reorders drops", async () => {
    const [a, b] = await drops.listDrops(userId);
    const patched = await drops.updateDrop(userId, a!.id, { enabled: false, leadMsOverride: 15000 });
    expect(patched).toMatchObject({ enabled: false, leadMsOverride: 15000 });
    expect((await drops.updateDrop(userId, a!.id, { leadMsOverride: null })).leadMsOverride).toBeNull();

    expect((await drops.listDrops(userId, { enabledOnly: true })).map((d) => d.id)).toEqual([b!.id]);

    await drops.reorderDrops(userId, [b!.id, a!.id]);
    expect((await drops.listDrops(userId)).map((d) => d.id)).toEqual([b!.id, a!.id]);
  });

  it("logs sets newest first, filters by time, and survives drop deletion", async () => {
    const [d] = await drops.listDrops(userId);
    const base = { dropId: d!.id, trackId: d!.trackId, trackName: d!.trackName, positionMs: 1000, leadMs: 20000 };
    await sets.insertSet(userId, { ...base, source: "pwa" });
    const latest = await sets.insertSet(userId, { ...base, source: "shortcut" });

    expect((await sets.getLatestSet(userId))?.id).toBe(latest.id);
    expect(await sets.listSets(userId, { limit: 10 })).toHaveLength(2);
    expect(await sets.listSets(userId, { limit: 1 })).toHaveLength(1);
    expect(await sets.listSets(userId, { limit: 0 })).toEqual([]);
    expect(await sets.listSets(userId, { limit: 10, since: new Date(Date.now() + 60_000).toISOString() })).toEqual([]);
    expect(await sets.listSets(otherUserId, { limit: 10 })).toEqual([]);

    await drops.deleteDrop(userId, d!.id);
    expect((await sets.getLatestSet(userId))?.dropId).toBeNull();
  });

  it("creates, resolves, and revokes shortcut tokens", async () => {
    const hash = hashToken(`raw-${suffix}`);
    const { id } = await tokens.insertToken(userId, "iPhone", hash);

    expect(await tokens.touchActiveToken(hash)).toEqual({ userId });
    const [listed] = await tokens.listTokens(userId);
    expect(listed).toMatchObject({ id, label: "iPhone" });
    expect(listed!.lastUsedAt).not.toBeNull();
    expect(listed).not.toHaveProperty("token_hash");

    await expect(tokens.revokeToken(otherUserId, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await tokens.revokeToken(userId, id);
    expect(await tokens.touchActiveToken(hash)).toBeNull();
    await expect(tokens.revokeToken(userId, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await tokens.listTokens(userId)).toEqual([]);
  });
});
