"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { Notice, pill, Spinner } from "@/components/ui";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import type { NudgeDelta } from "@/lib/logic/drop";
import { formatClock } from "@/lib/logic/format";
import type { Drop, SetRecord, Settings } from "@/lib/types";
import { LastCuedCard } from "./LastCuedCard";
import { NowPlayingCard } from "./NowPlayingCard";
import { RestChips } from "./RestChips";
import { RestCountdown, type ActiveRest } from "./RestCountdown";
import { UpNextCard } from "./UpNextCard";
import { useNowPlaying } from "./useNowPlaying";

interface Me {
  displayName: string | null;
  needsReauth: boolean;
  deviceLinked: boolean;
  playlistAccess: boolean;
}
type Action = "mark" | "rest" | "cue" | "nudge" | "upnext";

/** Changing the rest's drop this close to it can't land in time; Up next moves on to the next set. */
const REST_CHANGE_CUTOFF_MS = 3000;

/** A set cued recently enough that its drop is still ahead (or just hit). */
function activeRestFrom(set: SetRecord | null): ActiveRest | null {
  if (!set) return null;
  const dropAt = Date.parse(set.cuedAt) + set.leadMs;
  return dropAt > Date.now() ? { dropAt, totalMs: set.leadMs, trackName: set.trackName, dropId: set.dropId } : null;
}

export function HomeScreen() {
  const toast = useToast();
  const { now, fetchedAt, error, refresh } = useNowPlaying();
  const [me, setMe] = useState<Me | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [restMs, setRestMs] = useState<number | null>(null);
  const [lastSet, setLastSet] = useState<SetRecord | null>(null);
  const [activeRest, setActiveRest] = useState<ActiveRest | null>(null);
  /** True while the running rest's drop can still be changed from Up next. */
  const [restChangeable, setRestChangeable] = useState(false);
  const [busy, setBusy] = useState<Action | null>(null);

  const loadSettings = useCallback(
    () =>
      api<Settings>("/api/settings").then(
        (s) => {
          setSettings(s);
          setRestMs((current) => current ?? s.restMs);
        },
        () => {},
      ),
    [],
  );

  useEffect(() => {
    api<Me>("/api/me").then(setMe, () => {});
    void loadSettings();
    api<{ drops: Drop[] }>("/api/drops").then(
      (r) => setDrops(r.drops),
      () => {},
    );
    api<{ sets: SetRecord[] }>("/api/sets?limit=1").then(
      (r) => {
        const set = r.sets[0] ?? null;
        setLastSet(set);
        setActiveRest(activeRestFrom(set));
      },
      () => {},
    );
  }, [loadSettings]);

  /** Runs one action at a time and surfaces the server's message as a toast. */
  const run = useCallback(
    async (action: Action, fn: () => Promise<string | null>) => {
      if (busy) return;
      setBusy(action);
      try {
        const message = await fn();
        if (message) toast(message);
      } catch (err) {
        toast(errorMessage(err), "error");
        if (err instanceof ApiError && err.code === "PLAYLIST_ACCESS_REQUIRED")
          setMe((m) => m && { ...m, playlistAccess: false });
      } finally {
        setBusy(null);
      }
    },
    [busy, toast],
  );

  const markDrop = () =>
    run("mark", async () => {
      const res = await api<{ message: string }>("/api/drops/mark", { method: "POST", body: {} });
      navigator.vibrate?.(40);
      void refresh();
      api<{ drops: Drop[] }>("/api/drops").then(
        (r) => setDrops(r.drops),
        () => {},
      );
      return res.message;
    });

  /** After a rest or cue: show the countdown, and Up next goes back to auto. */
  const started = (set: SetRecord) => {
    navigator.vibrate?.([30, 40, 30]);
    setLastSet(set);
    setActiveRest(activeRestFrom(set));
    void loadSettings();
    void refresh();
  };

  const startRest = () =>
    run("rest", async () => {
      const res = await api<{ message: string; set: SetRecord }>("/api/rest", {
        method: "POST",
        body: restMs ? { restMs } : {},
      });
      started(res.set);
      return res.message;
    });

  const cue = () =>
    run("cue", async () => {
      const res = await api<{ message: string; set: SetRecord }>("/api/cue", { method: "POST", body: {} });
      started(res.set);
      return res.message;
    });

  /**
   * Up next. During a rest it's the song about to drop, so a pick changes this rest's drop
   * (same drop moment; starts partway in if its build-up no longer fits). Otherwise it's
   * the pick for the next rest/cue.
   */
  const setUpNext = (dropId: string | null) =>
    run("upnext", async () => {
      if (restChangeable && dropId) {
        const res = await api<{ message: string; set: SetRecord }>("/api/rest/swap", {
          method: "POST",
          body: { dropId },
        });
        setLastSet(res.set);
        setActiveRest((r) => r && { ...r, trackName: res.set.trackName, dropId: res.set.dropId });
        return res.message;
      }
      setSettings(await api<Settings>("/api/settings", { method: "PATCH", body: { nextDropId: dropId } }));
      return null;
    });

  const nudgeLast = (deltaMs: NudgeDelta) =>
    run("nudge", async () => {
      const res = await api<{ message: string }>("/api/cue/nudge-last", { method: "POST", body: { deltaMs } });
      void refresh();
      return res.message;
    });

  useEffect(() => {
    const changeableForMs = activeRest ? activeRest.dropAt - REST_CHANGE_CUTOFF_MS - Date.now() : 0;
    setRestChangeable(changeableForMs > 0);
    if (changeableForMs <= 0) return;
    const timer = setTimeout(() => setRestChangeable(false), changeableForMs);
    return () => clearTimeout(timer);
  }, [activeRest]);

  const clearActiveRest = useCallback(() => setActiveRest(null), []);
  const somethingPlaying = Boolean(now?.playing);
  const leadSec = Math.round((settings?.leadMs ?? 20000) / 1000);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between pt-3">
        <h1 className="text-[26px] font-bold tracking-tight">DropSet</h1>
        {me?.displayName && (
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ff8a3d] text-sm font-bold text-ink"
            title={me.displayName}
            aria-label={`Logged in as ${me.displayName}`}
          >
            {me.displayName.slice(0, 1).toUpperCase()}
          </span>
        )}
      </header>

      {me && !me.deviceLinked && (
        <Notice href="/settings" linkLabel="Link phone">
          No phone linked yet.
        </Notice>
      )}
      {me && settings?.restSource && !me.playlistAccess && (
        <Notice href="/settings" linkLabel="Fix">
          Log in again so rests can use your playlist.
        </Notice>
      )}

      <div className="flex flex-col gap-3">
        {activeRest ? (
          <RestCountdown rest={activeRest} onDone={clearActiveRest} />
        ) : (
          <NowPlayingCard now={now} fetchedAt={fetchedAt} error={error} />
        )}
        <button
          type="button"
          onClick={markDrop}
          disabled={!somethingPlaying || busy !== null}
          className={`${pill.secondary} min-h-12 text-[15px]`}
        >
          {busy === "mark" ? <Spinner /> : null}
          Mark drop
        </button>
      </div>

      {settings && (
        <UpNextCard
          drops={drops}
          nextDropId={settings.nextDropId}
          queueMode={settings.queueMode}
          restDropId={restChangeable ? (activeRest?.dropId ?? null) : null}
          busy={busy !== null}
          onChange={setUpNext}
        />
      )}

      {settings && restMs !== null && (
        <RestChips value={restMs} defaultMs={settings.restMs} disabled={busy !== null} onChange={setRestMs} />
      )}

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={startRest}
          disabled={busy !== null}
          className={`${pill.primary} min-h-16 w-full text-lg`}
        >
          {busy === "rest" ? (
            <Spinner className="h-6 w-6 border-[3px]" />
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
                <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
              </svg>
              {activeRest ? "Restart rest" : "Start rest"}
              <span className="font-semibold opacity-60">· {restMs !== null ? formatClock(restMs) : "…"}</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={cue}
          disabled={busy !== null}
          className="flex min-h-10 items-center gap-2 px-4 text-sm font-bold text-muted active:text-fg disabled:opacity-50"
        >
          {busy === "cue" ? <Spinner /> : null}
          Or start in {leadSec}s
        </button>
      </div>

      {lastSet && <LastCuedCard set={lastSet} busy={busy !== null} onNudge={nudgeLast} />}
    </div>
  );
}
