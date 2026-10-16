"use client";

import { NudgeButtons } from "@/components/NudgeButtons";
import { Card, SectionLabel } from "@/components/ui";
import { formatClock, formatLeadSeconds, formatMs, formatTimeAgo } from "@/lib/logic/format";
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
      <SectionLabel>Last set</SectionLabel>
      <p className="truncate text-base font-medium">{set.trackName}</p>
      <p className="mt-1 text-sm text-muted">
        {formatTimeAgo(set.cuedAt)} · from <span className="tabular-nums">{formatMs(set.positionMs)}</span> ·{" "}
        {set.leadMs >= 60_000 ? `${formatClock(set.leadMs)} rest` : `${formatLeadSeconds(set.leadMs)} lead`}
      </p>
      {set.dropId ? (
        <div className="mt-4">
          <NudgeButtons onNudge={onNudge} disabled={busy} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-faint">This drop was deleted.</p>
      )}
    </Card>
  );
}
