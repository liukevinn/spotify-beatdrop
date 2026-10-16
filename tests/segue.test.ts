import { describe, expect, it } from "vitest";
import { cutStartPosition, directStartPosition, MIN_FILLER_MS, planRest, type Filler } from "@/lib/logic/segue";

const drop = { trackUri: "spotify:track:drop", dropMs: 56_357, durationMs: 231_400 };
const f = (n: number, durationMs: number): Filler => ({ uri: `spotify:track:f${n}`, durationMs });
/** Deterministic "random": Fisher–Yates with j = 0 rotates, so order is predictable. */
const first = () => 0;

describe("planRest", () => {
  it("starts the drop song partway in when the rest is shorter than the build-up", () => {
    expect(planRest({ restMs: 45_000, drop, fillers: [] })).toEqual({ kind: "direct", positionMs: 11_357, durationMs: 231_400 });
  });

  it("starts the drop song at 0 when the rest equals the build-up", () => {
    expect(planRest({ restMs: 56_357, drop, fillers: [] })).toMatchObject({ kind: "direct", positionMs: 0 });
  });

  it("cuts to the drop song at rest − drop, so the drop lands exactly on the rest", () => {
    const plan = planRest({ restMs: 90_000, drop, fillers: [f(1, 200_000)] });
    expect(plan).toEqual({ kind: "timed", fillerUris: ["spotify:track:f1"], cutAfterMs: 90_000 - 56_357 });
  });

  it("queues rest music to outlast the whole rest (so a swap can move the cut later), even with a 12 s crossfade", () => {
    const fillers = [f(1, 60_000), f(2, 70_000), f(3, 80_000)];
    const plan = planRest({ restMs: 300_000, drop, fillers, random: first });
    if (plan?.kind !== "timed") throw new Error("expected a timed plan");
    const byUri = new Map(fillers.map((x) => [x.uri, x.durationMs]));
    const worstCaseMs = plan.fillerUris.reduce((sum, uri) => sum + byUri.get(uri)! - 12_000, 0);
    expect(worstCaseMs).toBeGreaterThan(300_000);
  });

  it("stays within the queue cap even with the shortest allowed fillers and the longest rest", () => {
    const plan = planRest({ restMs: 300_000, drop: { ...drop, dropMs: 15_000 }, fillers: [f(1, MIN_FILLER_MS)] });
    if (plan?.kind !== "timed") throw new Error("expected a timed plan");
    expect(plan.fillerUris.length * (MIN_FILLER_MS - 12_000)).toBeGreaterThan(300_000);
  });

  it("repeats songs when the pool is too small for the rest", () => {
    const plan = planRest({ restMs: 300_000, drop, fillers: [f(1, 60_000)] });
    if (plan?.kind !== "timed") throw new Error("expected a timed plan");
    expect(plan.fillerUris.length).toBeGreaterThan(4);
    expect(new Set(plan.fillerUris)).toEqual(new Set(["spotify:track:f1"]));
  });

  it("never uses the drop song or very short tracks as filler", () => {
    const fillers = [{ uri: drop.trackUri, durationMs: 200_000 }, f(1, MIN_FILLER_MS - 1)];
    expect(planRest({ restMs: 210_000, drop, fillers })).toBeNull();
  });

  it("returns null when filler time is needed but there are no fillers", () => {
    expect(planRest({ restMs: 210_000, drop, fillers: [] })).toBeNull();
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
