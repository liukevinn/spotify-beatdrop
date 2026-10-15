"use client";

import { useEffect, useState } from "react";
import { AlbumArt } from "@/components/AlbumArt";
import { NudgeButtons } from "@/components/NudgeButtons";
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
    <li className={`rounded-2xl border bg-surface ${expanded ? "border-volt/40" : "border-line"}`}>
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <AlbumArt url={drop.albumArtUrl} size={52} className={drop.enabled ? "" : "opacity-40"} />
          <span className={`min-w-0 flex-1 ${drop.enabled ? "" : "opacity-50"}`}>
            <span className="block truncate font-semibold">{drop.trackName}</span>
            <span className="block truncate text-sm text-muted">{drop.artists}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block font-semibold tabular-nums text-volt">{formatMs(drop.dropMs)}</span>
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
          <span className="h-7 w-12 rounded-full bg-line transition-colors peer-checked:bg-volt peer-focus-visible:outline-2 peer-focus-visible:outline-volt" />
          <span className="pointer-events-none absolute left-2 h-5 w-5 rounded-full bg-fg transition-transform peer-checked:translate-x-5 peer-checked:bg-ink" />
        </label>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-line p-3">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <button
              type="button"
              onClick={() => actions.onTest(drop)}
              disabled={busy}
              className="min-h-12 rounded-xl bg-fg text-[15px] font-bold text-ink active:bg-muted disabled:opacity-50"
            >
              ▶ Test drop
            </button>
            <button
              type="button"
              onClick={() => actions.onMove(drop, -1)}
              disabled={busy || isFirst}
              aria-label="Move up"
              className="min-h-12 w-12 rounded-xl border border-line bg-raised text-lg disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => actions.onMove(drop, 1)}
              disabled={busy || isLast}
              aria-label="Move down"
              className="min-h-12 w-12 rounded-xl border border-line bg-raised text-lg disabled:opacity-30"
            >
              ↓
            </button>
          </div>

          <NudgeButtons onNudge={(delta) => actions.onNudge(drop, delta)} disabled={busy} />

          <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line bg-raised px-3">
            <span className="text-[15px]">Lead time</span>
            <select
              value={leadValue}
              disabled={busy}
              onChange={(e) => actions.onLeadChange(drop, e.target.value ? Number(e.target.value) * 1000 : null)}
              className="bg-transparent py-2 text-right text-[15px] font-semibold text-volt outline-none"
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
            className={`min-h-12 rounded-xl border text-[15px] font-semibold ${
              confirmingDelete ? "border-danger bg-danger text-ink" : "border-danger/40 text-danger"
            }`}
          >
            {confirmingDelete ? "Tap again to delete" : "Delete"}
          </button>
        </div>
      )}
    </li>
  );
}
