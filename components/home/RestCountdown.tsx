"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { formatClock } from "@/lib/logic/format";

/** How long "Drop!" stays up after the countdown ends. */
const DROP_FLASH_MS = 8000;
const TICK_MS = 250;

export interface ActiveRest {
  dropAt: number;
  totalMs: number;
  trackName: string;
  dropId: string | null;
}

/** Live countdown to the drop. Calls `onDone` a few seconds after it hits. */
export function RestCountdown({ rest, onDone }: { rest: ActiveRest; onDone: () => void }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const leftMs = rest.dropAt - now;
  useEffect(() => {
    if (leftMs < -DROP_FLASH_MS) onDone();
  }, [leftMs, onDone]);

  const dropped = leftMs <= 0;
  const pct = Math.min(100, Math.max(0, (1 - leftMs / rest.totalMs) * 100));

  return (
    <Card className={dropped ? "bg-accent text-ink" : ""}>
      <div aria-live="polite">
        <p className={`text-sm font-bold ${dropped ? "text-ink/70" : "text-muted"}`}>{dropped ? "Lift" : "Drop in"}</p>
        <p className="mt-1 text-[64px] font-bold leading-none tabular-nums tracking-tighter">
          {dropped ? "Drop!" : formatClock(Math.ceil(leftMs / 1000) * 1000)}
        </p>
        <p className={`mt-2 truncate text-sm ${dropped ? "text-ink/70" : "text-muted"}`}>{rest.trackName}</p>
      </div>
      {!dropped && (
        <div className="mt-4 h-1 rounded-full bg-[#4d4d4d]">
          <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
      )}
    </Card>
  );
}
