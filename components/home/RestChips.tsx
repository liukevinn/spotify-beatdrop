"use client";

import { formatClock } from "@/lib/logic/format";

const PRESETS_MS = [90_000, 120_000, 150_000, 180_000, 210_000, 240_000, 300_000];

interface Props {
  value: number;
  defaultMs: number;
  disabled: boolean;
  onChange: (ms: number) => void;
}

/** Per-set rest length, as Spotify-style filter chips. The default (from Settings) is always offered. */
export function RestChips({ value, defaultMs, disabled, onChange }: Props) {
  const options = [...new Set([...PRESETS_MS, defaultMs])].sort((a, b) => a - b);

  return (
    <section>
      <h2 className="mb-2 text-lg font-bold tracking-tight">Rest</h2>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="radiogroup" aria-label="Rest time">
        {options.map((ms) => {
          const active = ms === value;
          return (
            <button
              key={ms}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(ms)}
              className={`min-h-9 shrink-0 rounded-full px-4 text-sm font-medium tabular-nums transition-colors disabled:opacity-50 ${
                active ? "bg-accent text-ink" : "bg-raised text-fg active:bg-line"
              }`}
            >
              {formatClock(ms)}
              {ms === defaultMs && <span className={active ? "text-ink/60" : "text-muted"}> · default</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
