"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import type { NowPlaying } from "@/lib/types";

const POLL_MS = 2000;

/**
 * Polls /api/player/now every 2 s while the page is visible and pauses when hidden.
 * `fetchedAt` lets the UI interpolate progress between polls.
 */
export function useNowPlaying() {
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setNow(await api<NowPlaying>("/api/player/now"));
      setFetchedAt(Date.now());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const loop = async () => {
      await refresh();
      if (!stopped && document.visibilityState === "visible") timer = setTimeout(loop, POLL_MS);
    };
    const onVisibility = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible") void loop();
    };

    if (document.visibilityState === "visible") void loop();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  return { now, fetchedAt, error, refresh };
}

/** Re-renders every `ms` while `active`, returning the current time. */
export function useClock(active: boolean, ms = 250): number {
  const [time, setTime] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTime(Date.now()), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return time;
}
