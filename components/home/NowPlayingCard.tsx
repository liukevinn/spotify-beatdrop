"use client";

import { AlbumArt } from "@/components/AlbumArt";
import { Card, OpenInSpotify } from "@/components/ui";
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
      <Card className="flex min-h-[96px] items-center gap-4">
        <div className="h-16 w-16 shrink-0 rounded bg-raised" aria-hidden />
        <div className="min-w-0">
          <p className="font-bold text-fg">
            {error ? "Can't reach Spotify" : now === null ? "Checking Spotify…" : "Nothing playing"}
          </p>
          <p className="mt-0.5 text-sm text-muted">{error ?? "Play a song on Spotify to tag its drop."}</p>
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
      <div className="flex items-center gap-3">
        <AlbumArt url={track.albumArtUrl} size={64} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold leading-tight">{track.name}</p>
          <p className="mt-0.5 truncate text-sm text-muted">{track.artists}</p>
          <p className={`mt-1.5 text-xs font-semibold ${drop ? "text-accent" : "text-faint"}`}>
            {drop ? (
              <>
                Drop at <span className="tabular-nums">{formatMs(drop.dropMs)}</span>
              </>
            ) : (
              "Not tagged yet"
            )}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="relative h-1 rounded-full bg-[#4d4d4d]">
          <div className="absolute inset-y-0 left-0 rounded-full bg-fg" style={{ width: pct(progressMs) }} />
          {drop && (
            <div
              className="absolute -top-1 h-3 w-1 -translate-x-1/2 rounded-full bg-accent"
              style={{ left: pct(drop.dropMs) }}
              aria-hidden
            />
          )}
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-muted">
          <span>{formatMs(progressMs)}</span>
          <span>
            {playing.isPlaying ? "" : "Paused · "}
            {formatMs(track.durationMs)}
          </span>
        </div>
      </div>

      <div className="mt-2 border-t border-raised pt-2">
        <OpenInSpotify trackId={track.id} />
      </div>
    </Card>
  );
}
