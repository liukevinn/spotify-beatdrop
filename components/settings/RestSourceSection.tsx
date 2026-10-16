"use client";

import { useCallback, useEffect, useState } from "react";
import { AlbumArt } from "@/components/AlbumArt";
import { useToast } from "@/components/Toast";
import { Card, pill, SectionLabel, Spinner } from "@/components/ui";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import type { PlaylistInfo, RestSource, Settings } from "@/lib/types";

type Choice = "none" | "liked" | string;

function choiceOf(source: RestSource | null): Choice {
  if (!source) return "none";
  return source.kind === "liked" ? "liked" : source.id;
}

/** Picks where rest music comes from: Liked Songs, an own playlist, or the tagged songs. */
export function RestSourceSection() {
  const toast = useToast();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistInfo[] | null>(null);
  const [needsAccess, setNeedsAccess] = useState(false);
  const [saving, setSaving] = useState<Choice | null>(null);
  /** Collapsed to the current choice; the full list can be long. */
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const settings = await api<Settings>("/api/settings");
      setChoice(choiceOf(settings.restSource));
    } catch (err) {
      toast(errorMessage(err), "error");
    }
    try {
      setPlaylists((await api<{ playlists: PlaylistInfo[] }>("/api/playlists")).playlists);
      setNeedsAccess(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === "PLAYLIST_ACCESS_REQUIRED") setNeedsAccess(true);
      else toast(errorMessage(err), "error");
      setPlaylists([]);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const pick = async (next: Choice) => {
    if (saving || next === choice) return;
    const restSource: RestSource | null =
      next === "none"
        ? null
        : next === "liked"
          ? { kind: "liked" }
          : {
              kind: "playlist",
              id: next,
              name: playlists?.find((p) => p.id === next)?.name ?? "Playlist",
            };
    setSaving(next);
    try {
      const settings = await api<Settings>("/api/settings", {
        method: "PATCH",
        body: { restSource },
      });
      setChoice(choiceOf(settings.restSource));
      setOpen(false);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(null);
    }
  };

  if (choice === null || playlists === null) return <Card className="h-48 animate-pulse" />;

  return (
    <Card>
      <div className="flex items-start justify-between">
        <SectionLabel>Backup music</SectionLabel>
        {!needsAccess && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="min-h-8 text-sm font-bold text-muted active:text-fg"
          >
            {open ? "Done" : "Change"}
          </button>
        )}
      </div>
      <p className="-mt-1 mb-3 text-sm text-muted">
        Rests keep whatever you&apos;re playing. DropSet plays this only when nothing is, and after each drop song.
        Tagged songs are skipped so their drops stay fresh.
      </p>

      {needsAccess && (
        <div className="mb-3 rounded-md bg-raised p-3 text-sm">
          <p>DropSet needs permission to read your Liked Songs and playlists.</p>
          <a href="/api/auth/login" className={`${pill.primary} mt-3 min-h-10 px-5 text-sm`}>
            Grant playlist access
          </a>
        </div>
      )}

      <ul className="-mx-2 flex flex-col" role="radiogroup" aria-label="Backup music">
        <SourceRow
          visible={open || needsAccess || choice === "liked"}
          active={choice === "liked"}
          saving={saving === "liked"}
          disabled={needsAccess}
          onClick={() => pick("liked")}
        >
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-raised text-xl text-accent"
            aria-hidden
          >
            ♥
          </div>
          <span className="min-w-0 flex-1">
            <SourceTitle active={choice === "liked"}>Liked Songs</SourceTitle>
            <span className="block text-sm text-muted">Your 100 most recent likes</span>
          </span>
        </SourceRow>

        {playlists
          .filter((p) => p.trackCount !== 0 || p.id === choice)
          .map((p) => (
            <SourceRow
              key={p.id}
              visible={open || choice === p.id}
              active={choice === p.id}
              saving={saving === p.id}
              disabled={needsAccess}
              onClick={() => pick(p.id)}
            >
              <AlbumArt url={p.imageUrl} size={48} />
              <span className="min-w-0 flex-1">
                <SourceTitle active={choice === p.id}>{p.name}</SourceTitle>
                {p.trackCount !== null && (
                  <span className="block text-sm text-muted">
                    {p.trackCount} {p.trackCount === 1 ? "song" : "songs"}
                  </span>
                )}
              </span>
            </SourceRow>
          ))}

        <SourceRow
          visible={open || needsAccess || choice === "none"}
          active={choice === "none"}
          saving={saving === "none"}
          disabled={false}
          onClick={() => pick("none")}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-raised text-muted" aria-hidden>
            ⤮
          </div>
          <span className="min-w-0 flex-1">
            <SourceTitle active={choice === "none"}>My other drop songs</SourceTitle>
            <span className="block text-sm text-muted">No extra permission needed</span>
          </span>
        </SourceRow>
      </ul>

      {open && !needsAccess && playlists.length === 0 && (
        <p className="mt-3 text-sm text-faint">
          Only playlists you created or collaborate on can be used. Copy any other playlist into a new one to use it.
        </p>
      )}
    </Card>
  );
}

/** Spotify's convention: the active row's title turns green. */
function SourceTitle({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <span className={`block truncate text-base font-medium ${active ? "text-accent" : ""}`}>{children}</span>;
}

function SourceRow(props: {
  visible: boolean;
  active: boolean;
  saving: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  if (!props.visible) return null;
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={props.active}
        disabled={props.disabled}
        onClick={props.onClick}
        className="flex w-full items-center gap-3 rounded-md p-2 text-left active:bg-raised disabled:opacity-40"
      >
        {props.children}
        {props.saving ? (
          <Spinner className="text-accent" />
        ) : props.active ? (
          <span className="text-accent" aria-hidden>
            ✓
          </span>
        ) : null}
      </button>
    </li>
  );
}
