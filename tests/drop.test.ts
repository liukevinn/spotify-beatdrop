import { describe, expect, it } from "vitest";
import { computeMarkedDropMs, nudgeDropMs, testStartMs } from "@/lib/logic/drop";
import { formatLeadSeconds, formatMs } from "@/lib/logic/format";

describe("mark-drop math", () => {
  it("subtracts the reaction offset", () => {
    expect(computeMarkedDropMs(83662, 250)).toBe(83412);
  });
  it("clamps at 0", () => {
    expect(computeMarkedDropMs(100, 250)).toBe(0);
  });
});

describe("nudgeDropMs", () => {
  it("applies the delta", () => {
    expect(nudgeDropMs(10000, 250, 200000)).toBe(10250);
    expect(nudgeDropMs(10000, -1000, 200000)).toBe(9000);
  });
  it("clamps to [0, duration - 1]", () => {
    expect(nudgeDropMs(500, -1000, 200000)).toBe(0);
    expect(nudgeDropMs(199500, 1000, 200000)).toBe(199999);
  });
});

describe("testStartMs", () => {
  it("starts 3 s before the drop, never before 0", () => {
    expect(testStartMs(10000)).toBe(7000);
    expect(testStartMs(1000)).toBe(0);
  });
});

describe("format", () => {
  it("formats m:ss.s", () => {
    expect(formatMs(83412)).toBe("1:23.4");
    expect(formatMs(0)).toBe("0:00.0");
    expect(formatMs(59999)).toBe("0:59.9");
    expect(formatMs(600000)).toBe("10:00.0");
  });
  it("formats the lead in whole seconds", () => {
    expect(formatLeadSeconds(20000)).toBe("20s");
    expect(formatLeadSeconds(12000)).toBe("12s");
  });
});

describe("groupByDay", async () => {
  const { groupByDay } = await import("@/lib/logic/history");
  const now = new Date(2026, 8, 24, 18, 0);
  const at = (d: number, h: number) => ({ cuedAt: new Date(2026, 8, d, h).toISOString() });

  it("groups newest-first sets by local day with friendly labels", () => {
    const groups = groupByDay([at(24, 17), at(24, 9), at(23, 20), at(20, 8)], now);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
      [expect.stringContaining("20"), 1],
    ]);
  });
});
