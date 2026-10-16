"use client";

import { useEffect, useState } from "react";
import { AlbumArt } from "@/components/AlbumArt";
import { NudgeButtons } from "@/components/NudgeButtons";
import { pill } from "@/components/ui";
import type { NudgeDelta } from "@/lib/logic/drop";
import { formatMs } from "@/lib/logic/format";
import type { Drop } from "@/lib/types";

const LEAD_OPTIONS_SEC = [10, 15, 20, 25, 30, 40] as const;
const DELETE_CONFIRM_MS = 3000;

export interface DropRowActions {
  onToggle: (drop: Drop) => void;
  onNudge: (drop: Drop, deltaMs: NudgeDelta) => void;
  onTest: (drop: Drop) => void;
  onLeadChange: (drop: Drop, leadMsOverride: number | null) => void;
  onDelete: (drop: Drop) => void;
  onMove: (drop: Drop, direction: -1 | 1) => void;
}

interface Props extends DropRowActions {
  drop: Drop;
  expanded: boolean;
  busy: boolean;
  isFirst: boolean;
  isLast: boolean;
  onExpand: () => void;
}

export function DropRow({ drop, expanded, busy, isFirst, isLast, onExpand, ...actions }: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!confirmingDelete) return;
    const timer = setTimeout(() => setConfirmingDelete(false), DELETE_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirmingDelete]);

  const leadValue = drop.leadMsOverride === null ? "" : String(drop.leadMsOverride / 1000);

  return (
    <li className={`rounded-lg ${expanded ? "bg-surface" : ""}`}>
      <div className="flex items-center gap-3 px-2 py-2">
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <AlbumArt url={drop.albumArtUrl} size={48} className={drop.enabled ? "" : "opacity-40"} />
          <span className={`min-w-0 flex-1 ${drop.enabled ? "" : "opacity-50"}`}>
            <span className={`block truncate text-base font-medium ${expanded ? "text-accent" : ""}`}>{drop.trackName}</span>
            <span className="block truncate text-sm text-muted">{drop.artists}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-sm tabular-nums text-muted">{formatMs(drop.dropMs)}</span>
            {drop.leadMsOverride !== null && (
              <span className="block text-[11px] text-muted">{drop.leadMsOverride / 1000}s lead</span>
            )}
          </span>
        </button>
        <label className="relative inline-flex shrink-0 items-center p-1">
          <span className="sr-only">{drop.enabled ? "Disable" : "Enable"} {drop.trackName}</span>
          <input
            type="checkbox"
            role="switch"
            checked={drop.enabled}
            onChange={() => actions.onToggle(drop)}
            className="peer sr-only"
          />
          <span className="h-6 w-10 rounded-full bg-line transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent" />
          <span className="pointer-events-none absolute left-1.5 h-5 w-5 rounded-full bg-fg shadow transition-transform peer-checked:translate-x-4" />
        </label>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 px-2 pb-3 pt-1">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <button
              type="button"
              onClick={() => actions.onTest(drop)}
              disabled={busy}
              className={`${pill.primary} min-h-11 text-[15px]`}
            >
              ▶ Test drop
            </button>
            <button
              type="button"
              onClick={() => actions.onMove(drop, -1)}
              disabled={busy || isFirst}
              aria-label="Move up"
              className={`${pill.subtle} min-h-11 w-11 text-lg`}
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => actions.onMove(drop, 1)}
              disabled={busy || isLast}
              aria-label="Move down"
              className={`${pill.subtle} min-h-11 w-11 text-lg`}
            >
              ↓
            </button>
          </div>

          <p className="-mb-1 text-sm text-muted">Test starts 3 s before the drop.</p>
          <NudgeButtons onNudge={(delta) => actions.onNudge(drop, delta)} disabled={busy} />

          <label className="flex min-h-11 items-center justify-between gap-3 rounded-full bg-raised px-4">
            <span className="text-[15px]">Lead time</span>
            <select
              value={leadValue}
              disabled={busy}
              onChange={(e) => actions.onLeadChange(drop, e.target.value ? Number(e.target.value) * 1000 : null)}
              className="bg-transparent py-2 text-right text-[15px] font-semibold text-fg outline-none"
            >
              <option value="">Default</option>
              {LEAD_OPTIONS_SEC.map((s) => (
                <option key={s} value={s}>
                  {s} s
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            disabled={busy}
            onClick={() => (confirmingDelete ? actions.onDelete(drop) : setConfirmingDelete(true))}
            className={`min-h-11 rounded-full text-[15px] font-bold ${
              confirmingDelete ? "bg-danger text-ink" : "text-danger active:bg-raised"
            }`}
          >
            {confirmingDelete ? "Tap again to delete" : "Delete"}
          </button>
        </div>
      )}
    </li>
  );
}
