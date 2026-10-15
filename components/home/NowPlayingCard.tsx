"use client";

import { AlbumArt } from "@/components/AlbumArt";
import { Card } from "@/components/ui";
import { formatMs } from "@/lib/logic/format";
import type { NowPlaying } from "@/lib/types";
import { useClock } from "./useNowPlaying";

interface Props {
  now: NowPlaying | null;
  fetchedAt: number;
  error: string | null;
}

export function NowPlayingCard({ now, fetchedAt, error }: Props) {
  const playing = now?.playing ? now : null;
  const clock = useClock(Boolean(playing?.isPlaying));

  if (!playing) {
    return (
      <Card className="flex min-h-[104px] items-center gap-4">
        <div className="h-[72px] w-[72px] shrink-0 rounded-lg bg-raised ring-1 ring-line" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold text-fg">
            {error ? "Can't reach Spotify" : now === null ? "Checking Spotify…" : "Nothing playing"}
          </p>
          <p className="mt-1 text-sm text-muted">{error ?? "Play a song on Spotify to tag its drop."}</p>
        </div>
      </Card>
    );
  }

  const { track, drop } = playing;
  const elapsed = playing.isPlaying ? Math.max(0, clock - fetchedAt) : 0;
  const progressMs = Math.min(playing.progressMs + elapsed, track.durationMs);
  const pct = (ms: number) => `${(ms / track.durationMs) * 100}%`;

  return (
    <Card>
      <div className="flex items-center gap-4">
        <AlbumArt url={track.albumArtUrl} size={72} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold leading-tight">{track.name}</p>
          <p className="mt-1 truncate text-sm text-muted">{track.artists}</p>
          {drop ? (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-volt/15 px-2.5 py-1 text-xs font-semibold text-volt">
              <span className="h-1.5 w-1.5 rounded-full bg-volt" aria-hidden />
              Tagged at <span className="tabular-nums">{formatMs(drop.dropMs)}</span>
            </span>
          ) : (
            <span className="mt-2 inline-block rounded-full bg-raised px-2.5 py-1 text-xs font-medium text-muted">
              Not tagged
            </span>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="relative h-1.5 rounded-full bg-raised">
          <div className="absolute inset-y-0 left-0 rounded-full bg-fg" style={{ width: pct(progressMs) }} />
          {drop && (
            <div
              className="absolute -top-1 h-3.5 w-1 -translate-x-1/2 rounded-full bg-volt"
              style={{ left: pct(drop.dropMs) }}
              aria-hidden
            />
          )}
        </div>
        <div className="mt-2 flex justify-between text-xs tabular-nums text-muted">
          <span>{formatMs(progressMs)}</span>
          <span>{playing.isPlaying ? "" : "Paused · "}{formatMs(track.durationMs)}</span>
        </div>
      </div>
    </Card>
  );
}
