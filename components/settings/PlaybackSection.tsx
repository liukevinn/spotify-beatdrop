"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { Card, SectionLabel } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import type { QueueMode, Settings } from "@/lib/types";

type Editable = Pick<Settings, "leadMs" | "reactionOffsetMs" | "queueMode" | "avoidRepeatWithin">;
const SAVE_DELAY_MS = 500;
const MAX_AVOID_REPEAT_UI = 20;

/** Local settings state with debounced PATCHes, so sliders feel instant. */
function useEditableSettings() {
  const toast = useToast();
  const [settings, setSettings] = useState<Editable | null>(null);
  const pending = useRef<Partial<Editable>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      setSettings(await api<Settings>("/api/settings"));
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }, [toast]);

  const flush = useCallback(async () => {
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    try {
      await api("/api/settings", { method: "PATCH", body: patch });
    } catch (err) {
      toast(errorMessage(err), "error");
      void load();
    }
  }, [load, toast]);

  const update = useCallback(
    (patch: Partial<Editable>) => {
      setSettings((prev) => prev && { ...prev, ...patch });
      pending.current = { ...pending.current, ...patch };
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    [flush],
  );

  useEffect(() => {
    void load();
    return () => {
      clearTimeout(timer.current);
      void flush();
    };
  }, [load, flush]);

  return { settings, update };
}

function SliderRow(props: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  hint: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="text-[15px] font-medium">{props.label}</span>
        <span className="text-lg font-bold tabular-nums text-volt">{props.display}</span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="mt-2 h-10 w-full accent-volt"
      />
      <span className="block text-xs text-muted">{props.hint}</span>
    </label>
  );
}

export function PlaybackSection() {
  const { settings, update } = useEditableSettings();
  if (!settings) return <Card className="h-80 animate-pulse" />;

  const modes: { value: QueueMode; label: string }[] = [
    { value: "shuffle", label: "Shuffle" },
    { value: "sequential", label: "In order" },
  ];

  return (
    <Card className="flex flex-col gap-6">
      <SectionLabel>Playback</SectionLabel>

      <SliderRow
        label="Lead time"
        value={settings.leadMs / 1000}
        display={`${settings.leadMs / 1000}s`}
        min={5}
        max={60}
        step={1}
        hint="How long before the drop the song starts."
        onChange={(sec) => update({ leadMs: sec * 1000 })}
      />

      <SliderRow
        label="Reaction offset"
        value={settings.reactionOffsetMs}
        display={`${settings.reactionOffsetMs}ms`}
        min={0}
        max={600}
        step={25}
        hint="Subtracted when you tap Mark drop, to cancel out your reaction time."
        onChange={(ms) => update({ reactionOffsetMs: ms })}
      />

      <div>
        <p className="mb-2 text-[15px] font-medium">Queue</p>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-raised p-1" role="radiogroup" aria-label="Queue mode">
          {modes.map((mode) => (
            <button
              key={mode.value}
              type="button"
              role="radio"
              aria-checked={settings.queueMode === mode.value}
              onClick={() => update({ queueMode: mode.value })}
              className={`min-h-11 rounded-lg text-[15px] font-semibold ${
                settings.queueMode === mode.value ? "bg-fg text-ink" : "text-muted"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[15px] font-medium">Avoid repeats within</p>
          <p className="text-xs text-muted">Skip songs from your last N sets (past 4 h).</p>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-xl bg-raised p-1">
          <button
            type="button"
            aria-label="Fewer"
            disabled={settings.avoidRepeatWithin <= 0}
            onClick={() => update({ avoidRepeatWithin: settings.avoidRepeatWithin - 1 })}
            className="h-11 w-11 rounded-lg text-xl font-semibold disabled:opacity-30"
          >
            −
          </button>
          <span className="w-8 text-center text-lg font-bold tabular-nums text-volt">{settings.avoidRepeatWithin}</span>
          <button
            type="button"
            aria-label="More"
            disabled={settings.avoidRepeatWithin >= MAX_AVOID_REPEAT_UI}
            onClick={() => update({ avoidRepeatWithin: settings.avoidRepeatWithin + 1 })}
            className="h-11 w-11 rounded-lg text-xl font-semibold disabled:opacity-30"
          >
            +
          </button>
        </div>
      </div>
    </Card>
  );
}
