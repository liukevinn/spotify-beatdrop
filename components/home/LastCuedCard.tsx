"use client";

import { NudgeButtons } from "@/components/NudgeButtons";
import { Card, SectionLabel } from "@/components/ui";
import { formatLeadSeconds, formatMs, formatTimeAgo } from "@/lib/logic/format";
import type { NudgeDelta } from "@/lib/logic/drop";
import type { SetRecord } from "@/lib/types";

interface Props {
  set: SetRecord;
  busy: boolean;
  onNudge: (deltaMs: NudgeDelta) => void;
}

export function LastCuedCard({ set, busy, onNudge }: Props) {
  return (
    <Card>
      <SectionLabel>Last cued</SectionLabel>
      <p className="truncate text-[17px] font-semibold">{set.trackName}</p>
      <p className="mt-1 text-sm text-muted">
        {formatTimeAgo(set.cuedAt)} · from <span className="tabular-nums">{formatMs(set.positionMs)}</span> ·{" "}
        {formatLeadSeconds(set.leadMs)} lead
      </p>
      {set.dropId ? (
        <>
          <p className="mb-2 mt-4 text-xs text-muted">Drop felt early or late? Nudge it.</p>
          <NudgeButtons onNudge={onNudge} disabled={busy} />
        </>
      ) : (
        <p className="mt-3 text-xs text-faint">This drop was deleted.</p>
      )}
    </Card>
  );
}
