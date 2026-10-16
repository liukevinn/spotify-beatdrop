"use client";

import { pill } from "@/components/ui";
import { NUDGE_DELTAS, type NudgeDelta } from "@/lib/logic/drop";

/**
 * Labelled by what the user heard, not by the math: "the drop came 1s early" moves the
 * saved drop 1 s earlier in the song, which makes the next cue/rest/test land later.
 */
const LABELS: Record<NudgeDelta, string> = { [-1000]: "1s early", [-250]: "¼s early", 250: "¼s late", 1000: "1s late" };

export function NudgeButtons({ onNudge, disabled }: { onNudge: (deltaMs: NudgeDelta) => void; disabled?: boolean }) {
  return (
    <div>
      <p className="mb-2 text-sm text-muted">The drop came…</p>
      <div className="grid grid-cols-4 gap-2" role="group" aria-label="The drop came early or late">
        {NUDGE_DELTAS.map((delta) => (
          <button
            key={delta}
            type="button"
            disabled={disabled}
            onClick={() => onNudge(delta)}
            aria-label={`The drop came ${LABELS[delta]}`}
            className={`${pill.subtle} min-h-11 px-1 text-[13px] tabular-nums`}
          >
            {LABELS[delta]}
          </button>
        ))}
      </div>
    </div>
  );
}
