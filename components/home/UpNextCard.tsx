"use client";

import { useState } from "react";
import { AlbumArt } from "@/components/AlbumArt";
import { formatMs } from "@/lib/logic/format";
import { DropList, PickRow, RowText } from "./DropList";
import type { Drop, QueueMode } from "@/lib/types";

interface Props {
  drops: Drop[];
  nextDropId: string | null;
  queueMode: QueueMode;
  /**
   * The drop of the rest that's running, while it can still be changed. Up next then means
   * "the song about to drop": picking one changes this rest's drop (no Auto option).
   */
  restDropId: string | null;
  busy: boolean;
  onChange: (dropId: string | null) => void;
}

export function ShuffleTile({ size }: { size: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded bg-raised text-muted"
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
      </svg>
    </div>
  );
}

/**
 * "Up next": the song that drops next. During a rest that's the rest's drop song; otherwise
 * the pick for the next rest/cue. Expands inline into a track list.
 */
export function UpNextCard({ drops, nextDropId, queueMode, restDropId, busy, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const enabled = drops.filter((d) => d.enabled);
  const inRest = restDropId !== null;
  const currentId = inRest ? restDropId : nextDropId;
  const selected = drops.find((d) => d.id === currentId) ?? null;
  const autoLabel = queueMode === "shuffle" ? "Shuffle" : "In order";

  const choose = (id: string | null) => {
    setOpen(false);
    if (id !== currentId) onChange(id);
  };

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-lg font-bold tracking-tight">Up next</h2>
        {enabled.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            disabled={busy}
            aria-expanded={open}
            className="min-h-8 text-sm font-bold text-muted active:text-fg disabled:opacity-50"
          >
            {open ? "Done" : "Change"}
          </button>
        )}
      </div>

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={busy || enabled.length === 0}
          className="flex w-full items-center gap-3 rounded-md py-1 text-left active:bg-surface disabled:opacity-60"
        >
          {selected ? <AlbumArt url={selected.albumArtUrl} size={48} /> : <ShuffleTile size={48} />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-medium">
              {enabled.length === 0 ? "Tag a drop first" : selected ? selected.trackName : `Auto · ${autoLabel}`}
            </span>
            <span className="block truncate text-sm text-muted">
              {selected ? (
                <>
                  {inRest ? "Drops at the end of this rest" : selected.artists} · drop at{" "}
                  <span className="tabular-nums">{formatMs(selected.dropMs)}</span>
                </>
              ) : (
                "Picks a song you haven't played recently"
              )}
            </span>
          </span>
        </button>
      )}

      {open && (
        <DropList drops={enabled} selectedId={currentId} label="Up next" onPick={(d) => choose(d.id)}>
          {!inRest && (
            <PickRow selected={nextDropId === null} onClick={() => choose(null)}>
              <ShuffleTile size={48} />
              <RowText selected={nextDropId === null} title="Auto" subtitle={`${autoLabel}, skipping recent songs`} />
            </PickRow>
          )}
        </DropList>
      )}
    </section>
  );
}
