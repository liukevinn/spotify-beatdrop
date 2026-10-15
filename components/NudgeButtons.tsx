"use client";

import { NUDGE_DELTAS, type NudgeDelta } from "@/lib/logic/drop";

const LABELS: Record<NudgeDelta, string> = { [-1000]: "−1s", [-250]: "−¼s", 250: "+¼s", 1000: "+1s" };

export function NudgeButtons({ onNudge, disabled }: { onNudge: (deltaMs: NudgeDelta) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label="Nudge drop time">
      {NUDGE_DELTAS.map((delta) => (
        <button
          key={delta}
          type="button"
          disabled={disabled}
          onClick={() => onNudge(delta)}
          aria-label={`Move drop ${delta < 0 ? "earlier" : "later"} by ${Math.abs(delta) / 1000} seconds`}
          className="min-h-12 rounded-xl border border-line bg-raised text-[15px] font-semibold tabular-nums text-fg active:bg-line disabled:opacity-40"
        >
          {LABELS[delta]}
        </button>
      ))}
    </div>
  );
}
