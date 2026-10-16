import { describe, expect, it } from "vitest";
import {
  AFTER_DROP_MUSIC_MS,
  cutStartPosition,
  directStartPosition,
  MIN_FILLER_MS,
  musicAfterDrop,
  planRest,
  type Filler,
} from "@/lib/logic/segue";

const drop = { trackUri: "spotify:track:drop", dropMs: 56_357, durationMs: 231_400 };
const f = (n: number, durationMs: number): Filler => ({ uri: `spotify:track:f${n}`, durationMs });
/** Deterministic "random": Fisher–Yates with j = 0 rotates, so order is predictable. */
const first = () => 0;

/** Worst-case playing time of a queue, if Spotify's 12 s max crossfade shortens every hand-off. */
function worstCaseMs(uris: string[], fillers: Filler[]): number {
  const byUri = new Map(fillers.map((x) => [x.uri, x.durationMs]));
  return uris.reduce((sum, uri) => sum + byUri.get(uri)! - 12_000, 0);
}

describe("planRest", () => {
  it("keeps what's playing and just schedules the cut at rest − drop", () => {
    const fillers = [f(1, 200_000)];
    const plan = planRest({ restMs: 90_000, drop, fillers, keepPlaying: true });
    expect(plan).toMatchObject({ kind: "timed", fillerUris: [], cutAfterMs: 90_000 - 56_357 });
  });

  it("keeps what's playing even with no backup music at all", () => {
    expect(planRest({ restMs: 90_000, drop, fillers: [], keepPlaying: true })).toEqual({
      kind: "timed",
      fillerUris: [],
      cutAfterMs: 33_643,
      afterUris: [],
    });
  });

  it("starts backup music that outlasts the whole rest when nothing is playing", () => {
    const fillers = [f(1, 60_000), f(2, 70_000), f(3, 80_000)];
    const plan = planRest({ restMs: 300_000, drop, fillers, keepPlaying: false, random: first });
    if (plan?.kind !== "timed") throw new Error("expected a timed plan");
    expect(plan.fillerUris.length).toBeGreaterThan(0);
    expect(worstCaseMs(plan.fillerUris, fillers)).toBeGreaterThan(300_000);
  });

  it("returns null when nothing is playing and there's no backup music", () => {
    expect(planRest({ restMs: 210_000, drop, fillers: [], keepPlaying: false })).toBeNull();
  });

  it("starts the drop song partway in when the rest is shorter than the build-up", () => {
    expect(planRest({ restMs: 45_000, drop, fillers: [], keepPlaying: false })).toEqual({
      kind: "direct",
      positionMs: 11_357,
      durationMs: 231_400,
      afterUris: [],
    });
  });

  it("starts the drop song at 0 when the rest equals the build-up", () => {
    expect(planRest({ restMs: 56_357, drop, fillers: [], keepPlaying: true })).toMatchObject({
      kind: "direct",
      positionMs: 0,
    });
  });

  it("queues enough backup music behind the drop song to carry into the next rest", () => {
    const fillers = [f(1, 180_000), f(2, 200_000)];
    const plan = planRest({ restMs: 210_000, drop, fillers, keepPlaying: true, random: first })!;
    expect(worstCaseMs(plan.afterUris, fillers)).toBeGreaterThan(AFTER_DROP_MUSIC_MS);
  });

  it("repeats songs when the pool is small, within the queue cap", () => {
    const fillers = [f(1, MIN_FILLER_MS)];
    const plan = planRest({ restMs: 300_000, drop: { ...drop, dropMs: 15_000 }, fillers, keepPlaying: false });
    if (plan?.kind !== "timed") throw new Error("expected a timed plan");
    expect(new Set(plan.fillerUris)).toEqual(new Set(["spotify:track:f1"]));
    expect(plan.fillerUris.length * (MIN_FILLER_MS - 12_000)).toBeGreaterThan(300_000);
  });

  it("never uses the drop song or very short tracks as backup music", () => {
    const fillers = [{ uri: drop.trackUri, durationMs: 200_000 }, f(1, MIN_FILLER_MS - 1)];
    expect(planRest({ restMs: 210_000, drop, fillers, keepPlaying: false })).toBeNull();
    expect(musicAfterDrop(fillers, drop.trackUri)).toEqual([]);
  });
});

describe("start positions", () => {
  it("direct: starts later by the time already spent, never into the last second", () => {
    const plan = { positionMs: 10_000, durationMs: 200_000 };
    expect(directStartPosition(plan, 850)).toBe(10_850);
    expect(directStartPosition(plan, -50)).toBe(10_000);
    expect(directStartPosition(plan, 500_000)).toBe(199_000);
  });

  it("cut: starts at 0, or as far in as the cut fired late", () => {
    expect(cutStartPosition(1_000_000, 999_990)).toBe(0);
    expect(cutStartPosition(1_000_000, 1_000_240)).toBe(240);
  });
});
