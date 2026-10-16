"use client";

import { useEffect, useState } from "react";
import { Card, Spinner } from "@/components/ui";
import { formatClock } from "@/lib/logic/format";
import type { Drop } from "@/lib/types";
import { DropList } from "./DropList";

/** How long "Drop!" stays up after the countdown ends. */
const DROP_FLASH_MS = 8000;
const TICK_MS = 250;
/** Swapping this close to the drop can't land in time, so the button hides. */
const MIN_SWAP_LEFT_MS = 3000;

export interface ActiveRest {
  dropAt: number;
  totalMs: number;
  trackName: string;
  dropId: string | null;
}

interface Props {
  rest: ActiveRest;
  drops: Drop[];
  swapping: boolean;
  onSwap: (drop: Drop) => void;
  onDone: () => void;
}

/** Live countdown to the drop, with "Swap song" to change the drop song but keep the moment. */
export function RestCountdown({ rest, drops, swapping, onSwap, onDone }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const leftMs = rest.dropAt - now;
  useEffect(() => {
    if (leftMs < -DROP_FLASH_MS) onDone();
  }, [leftMs, onDone]);

  const dropped = leftMs <= 0;
  const canSwap = leftMs > MIN_SWAP_LEFT_MS && drops.some((d) => d.enabled && d.id !== rest.dropId);
  const pct = Math.min(100, Math.max(0, (1 - leftMs / rest.totalMs) * 100));

  return (
    <Card className={dropped ? "bg-accent text-ink" : ""}>
      <div className="flex items-start justify-between gap-3" aria-live="polite">
        <div className="min-w-0">
          <p className={`text-sm font-bold ${dropped ? "text-ink/70" : "text-muted"}`}>{dropped ? "Lift" : "Drop in"}</p>
          <p className="mt-1 text-[64px] font-bold leading-none tabular-nums tracking-tighter">
            {dropped ? "Drop!" : formatClock(Math.ceil(leftMs / 1000) * 1000)}
          </p>
          <p className={`mt-2 truncate text-sm ${dropped ? "text-ink/70" : "text-muted"}`}>{rest.trackName}</p>
        </div>
        {canSwap && (
          <button
            type="button"
            onClick={() => setPicking((p) => !p)}
            disabled={swapping}
            aria-expanded={picking}
            className="flex min-h-8 shrink-0 items-center gap-2 text-sm font-bold text-muted active:text-fg disabled:opacity-50"
          >
            {swapping && <Spinner />}
            {picking ? "Done" : "Swap song"}
          </button>
        )}
      </div>

      {!dropped && (
        <div className="mt-4 h-1 rounded-full bg-[#4d4d4d]">
          <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
      )}

      {picking && canSwap && (
        <div className="mt-4 border-t border-raised pt-3">
          <p className="mb-1 text-sm text-muted">Same drop moment, different song.</p>
          <DropList
            drops={drops.filter((d) => d.enabled)}
            selectedId={rest.dropId}
            label="Swap drop song"
            onPick={(d) => {
              setPicking(false);
              if (d.id !== rest.dropId) onSwap(d);
            }}
          />
        </div>
      )}
    </Card>
  );
}
