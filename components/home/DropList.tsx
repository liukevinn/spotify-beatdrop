"use client";

import { AlbumArt } from "@/components/AlbumArt";
import { formatMs } from "@/lib/logic/format";
import type { Drop } from "@/lib/types";

/** Spotify-style track list for picking a drop. The selected row's title turns green. */
export function DropList({
  drops,
  selectedId,
  label,
  onPick,
  children,
}: {
  drops: Drop[];
  selectedId: string | null;
  label: string;
  onPick: (drop: Drop) => void;
  /** Extra rows above the drops (e.g. "Auto"). */
  children?: React.ReactNode;
}) {
  return (
    <ul className="flex max-h-96 flex-col overflow-y-auto" role="listbox" aria-label={label}>
      {children}
      {drops.map((d) => (
        <PickRow key={d.id} selected={d.id === selectedId} onClick={() => onPick(d)}>
          <AlbumArt url={d.albumArtUrl} size={48} />
          <RowText selected={d.id === selectedId} title={d.trackName} subtitle={d.artists} />
          <span className="shrink-0 text-sm tabular-nums text-muted">{formatMs(d.dropMs)}</span>
        </PickRow>
      ))}
    </ul>
  );
}

export function RowText({ selected, title, subtitle }: { selected: boolean; title: string; subtitle: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className={`block truncate text-base font-medium ${selected ? "text-accent" : ""}`}>{title}</span>
      <span className="block truncate text-sm text-muted">{subtitle}</span>
    </span>
  );
}

export function PickRow({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-md py-2 text-left active:bg-raised"
      >
        {children}
      </button>
    </li>
  );
}
