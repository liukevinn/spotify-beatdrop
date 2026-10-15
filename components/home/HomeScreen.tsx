"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { Notice, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import type { NudgeDelta } from "@/lib/logic/drop";
import type { SetRecord } from "@/lib/types";
import { LastCuedCard } from "./LastCuedCard";
import { NowPlayingCard } from "./NowPlayingCard";
import { useNowPlaying } from "./useNowPlaying";

interface Me {
  displayName: string | null;
  needsReauth: boolean;
  deviceLinked: boolean;
}
type Action = "mark" | "cue" | "nudge";

export function HomeScreen() {
  const toast = useToast();
  const { now, fetchedAt, error, refresh } = useNowPlaying();
  const [me, setMe] = useState<Me | null>(null);
  const [lastSet, setLastSet] = useState<SetRecord | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);

  useEffect(() => {
    api<Me>("/api/me").then(setMe, () => {});
    api<{ sets: SetRecord[] }>("/api/sets?limit=1").then((r) => setLastSet(r.sets[0] ?? null), () => {});
  }, []);

  /** Runs one action at a time and surfaces the server's message as a toast. */
  const run = useCallback(
    async (action: Action, fn: () => Promise<string>) => {
      if (busy) return;
      setBusy(action);
      try {
        toast(await fn());
      } catch (err) {
        toast(errorMessage(err), "error");
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
      return res.message;
    });

  const cue = () =>
    run("cue", async () => {
      const res = await api<{ message: string; set: SetRecord }>("/api/cue", { method: "POST", body: {} });
      navigator.vibrate?.([30, 40, 30]);
      setLastSet(res.set);
      void refresh();
      return res.message;
    });

  const nudgeLast = (deltaMs: NudgeDelta) =>
    run("nudge", async () => {
      const res = await api<{ message: string }>("/api/cue/nudge-last", { method: "POST", body: { deltaMs } });
      void refresh();
      return res.message;
    });

  const somethingPlaying = Boolean(now?.playing);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between pt-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-volt">DropSet</p>
        {me?.displayName && <p className="truncate text-sm text-muted">{me.displayName}</p>}
      </header>

      {me && !me.deviceLinked && (
        <Notice href="/settings" linkLabel="Link phone">
          No phone linked yet.
        </Notice>
      )}

      <NowPlayingCard now={now} fetchedAt={fetchedAt} error={error} />

      <button
        type="button"
        onClick={markDrop}
        disabled={!somethingPlaying || busy !== null}
        className={`flex min-h-16 items-center justify-center gap-2 rounded-2xl border-2 text-[17px] font-bold transition-colors ${
          somethingPlaying
            ? "border-volt text-volt active:bg-volt/10"
            : "border-line text-faint"
        } disabled:cursor-not-allowed`}
      >
        {busy === "mark" ? <Spinner /> : null}
        Mark drop
      </button>

      <button
        type="button"
        onClick={cue}
        disabled={busy !== null}
        className="flex min-h-36 flex-col items-center justify-center rounded-3xl bg-volt text-ink shadow-[0_0_60px_-15px] shadow-volt/60 transition-transform active:scale-[0.98] active:bg-volt-dim disabled:opacity-70"
      >
        {busy === "cue" ? (
          <Spinner className="h-7 w-7 border-[3px]" />
        ) : (
          <>
            <span className="font-display text-[34px] font-black uppercase leading-none tracking-tight">Cue set</span>
            <span className="mt-2 text-sm font-semibold opacity-70">Next song, right before the drop</span>
          </>
        )}
      </button>

      {lastSet && <LastCuedCard set={lastSet} busy={busy !== null} onNudge={nudgeLast} />}
    </div>
  );
}
