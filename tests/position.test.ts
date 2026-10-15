import { describe, expect, it } from "vitest";
import { computeStartPosition } from "@/lib/logic/position";

const settings = { leadMs: 20000 };

describe("computeStartPosition", () => {
  it("starts lead ms before the drop", () => {
    const drop = { dropMs: 83412, durationMs: 200000, leadMsOverride: null };
    expect(computeStartPosition(drop, settings)).toEqual({ positionMs: 63412, leadMs: 20000 });
  });

  it("clamps to 0 and reports the real lead when the drop is earlier than the lead", () => {
    const drop = { dropMs: 12000, durationMs: 200000, leadMsOverride: null };
    expect(computeStartPosition(drop, settings)).toEqual({ positionMs: 0, leadMs: 12000 });
  });

  it("prefers the per-track override over the default lead", () => {
    const drop = { dropMs: 60000, durationMs: 200000, leadMsOverride: 30000 };
    expect(computeStartPosition(drop, settings)).toEqual({ positionMs: 30000, leadMs: 30000 });
  });

  it("never starts within the last second of the track", () => {
    const drop = { dropMs: 199900, durationMs: 200000, leadMsOverride: 5000 };
    // raw = 194900 < 199000, so it's fine; push the drop past the end to force the clamp
    expect(computeStartPosition(drop, settings).positionMs).toBe(194900);
    const late = { dropMs: 250000, durationMs: 200000, leadMsOverride: 5000 };
    expect(computeStartPosition(late, settings)).toEqual({ positionMs: 199000, leadMs: 51000 });
  });

  it("handles tracks shorter than a second", () => {
    const drop = { dropMs: 500, durationMs: 800, leadMsOverride: null };
    expect(computeStartPosition(drop, settings)).toEqual({ positionMs: 0, leadMs: 500 });
  });
});
