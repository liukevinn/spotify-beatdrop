import { describe, expect, it } from "vitest";
import { selectNextDrop, type QueueDrop } from "@/lib/logic/queue";

const drops: QueueDrop[] = [
  { id: "a", trackId: "ta" },
  { id: "b", trackId: "tb" },
  { id: "c", trackId: "tc" },
  { id: "d", trackId: "td" },
];
const set = (trackId: string) => ({ trackId });

describe("selectNextDrop", () => {
  it("returns null with no enabled drops", () => {
    expect(selectNextDrop({ enabledDrops: [], recentSets: [], lastSet: null, queueMode: "shuffle" })).toBeNull();
  });

  it("returns a forced drop when it is enabled", () => {
    const pick = selectNextDrop({
      enabledDrops: drops,
      recentSets: [set("tc")],
      lastSet: set("tc"),
      queueMode: "sequential",
      forcedDropId: "c",
    });
    expect(pick?.id).toBe("c");
  });

  it("ignores a forced id that isn't among the enabled drops", () => {
    const pick = selectNextDrop({
      enabledDrops: drops,
      recentSets: [],
      lastSet: null,
      queueMode: "sequential",
      forcedDropId: "missing",
    });
    expect(pick?.id).toBe("a");
  });

  it("excludes tracks cued within the repeat window", () => {
    const picks = new Set<string>();
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const pick = selectNextDrop({
        enabledDrops: drops,
        recentSets: [set("ta"), set("tb")],
        lastSet: set("ta"),
        queueMode: "shuffle",
        random: () => r,
      });
      picks.add(pick!.id);
    }
    expect([...picks].sort()).toEqual(["c", "d"]);
  });

  it("relaxes to 'anything but the last track' when everything is excluded", () => {
    const pick = selectNextDrop({
      enabledDrops: drops.slice(0, 2),
      recentSets: [set("tb"), set("ta")],
      lastSet: set("tb"),
      queueMode: "shuffle",
      random: () => 0.99,
    });
    expect(pick?.id).toBe("a");
  });

  it("repeats the only drop when just one is tagged", () => {
    const pick = selectNextDrop({
      enabledDrops: [drops[0]!],
      recentSets: [set("ta")],
      lastSet: set("ta"),
      queueMode: "shuffle",
    });
    expect(pick?.id).toBe("a");
  });

  it("walks sequentially from the last cued track and wraps around", () => {
    const next = (lastTrack: string | null) =>
      selectNextDrop({
        enabledDrops: drops,
        recentSets: [],
        lastSet: lastTrack ? set(lastTrack) : null,
        queueMode: "sequential",
      })?.id;
    expect(next(null)).toBe("a");
    expect(next("tb")).toBe("c");
    expect(next("td")).toBe("a");
    expect(next("t-deleted")).toBe("a");
  });

  it("skips excluded tracks in sequential mode", () => {
    const pick = selectNextDrop({
      enabledDrops: drops,
      recentSets: [set("td"), set("ta")],
      lastSet: set("td"),
      queueMode: "sequential",
    });
    expect(pick?.id).toBe("b");
  });

  it("uses the injected random source in shuffle mode", () => {
    const pick = (r: number) =>
      selectNextDrop({ enabledDrops: drops, recentSets: [], lastSet: null, queueMode: "shuffle", random: () => r })
        ?.id;
    expect(pick(0)).toBe("a");
    expect(pick(0.5)).toBe("c");
    expect(pick(0.9999)).toBe("d");
  });
});
