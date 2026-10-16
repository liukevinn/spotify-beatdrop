import { describe, expect, it } from "vitest";
import { nudgeDropMs, testStartMs } from "@/lib/logic/drop";
import { formatLeadSeconds, formatMs } from "@/lib/logic/format";

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
