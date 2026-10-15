"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { EmptyState, PageHeader, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import type { NudgeDelta } from "@/lib/logic/drop";
import { formatMs } from "@/lib/logic/format";
import type { Drop } from "@/lib/types";
import { DropRow, type DropRowActions } from "./DropRow";

type DropResponse = { drop: Drop };

export function LibraryScreen() {
  const toast = useToast();
  const [drops, setDrops] = useState<Drop[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDrops((await api<{ drops: Drop[] }>("/api/drops")).drops);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const replace = (updated: Drop) => setDrops((prev) => prev?.map((d) => (d.id === updated.id ? updated : d)) ?? null);

  /** Runs a per-row request; returns the toast message on success. */
  const withRow = async (drop: Drop, fn: () => Promise<string | void>) => {
    setBusyId(drop.id);
    try {
      const message = await fn();
      if (message) toast(message);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusyId(null);
    }
  };

  const actions: DropRowActions = {
    onToggle: (drop) =>
      withRow(drop, async () => {
        replace({ ...drop, enabled: !drop.enabled });
        try {
          const res = await api<DropResponse>(`/api/drops/${drop.id}`, {
            method: "PATCH",
            body: { enabled: !drop.enabled },
          });
          replace(res.drop);
        } catch (err) {
          replace(drop);
          throw err;
        }
      }),

    onNudge: (drop, deltaMs: NudgeDelta) =>
      withRow(drop, async () => {
        const res = await api<DropResponse>(`/api/drops/${drop.id}/nudge`, { method: "POST", body: { deltaMs } });
        replace(res.drop);
        return `Drop at ${formatMs(res.drop.dropMs)}`;
      }),

    onTest: (drop) =>
      withRow(drop, async () => {
        await api(`/api/drops/${drop.id}/test`, { method: "POST", body: {} });
        return `▶ ${drop.trackName} — drop in 3s`;
      }),

    onLeadChange: (drop, leadMsOverride) =>
      withRow(drop, async () => {
        const res = await api<DropResponse>(`/api/drops/${drop.id}`, { method: "PATCH", body: { leadMsOverride } });
        replace(res.drop);
      }),

    onDelete: (drop) =>
      withRow(drop, async () => {
        await api(`/api/drops/${drop.id}`, { method: "DELETE" });
        setDrops((prev) => prev?.filter((d) => d.id !== drop.id) ?? null);
        setExpandedId(null);
        return `Deleted ${drop.trackName}`;
      }),

    onMove: (drop, direction) =>
      withRow(drop, async () => {
        if (!drops) return;
        const from = drops.findIndex((d) => d.id === drop.id);
        const to = from + direction;
        if (from < 0 || to < 0 || to >= drops.length) return;

        const previous = drops;
        const next = [...drops];
        [next[from], next[to]] = [next[to]!, next[from]!];
        setDrops(next);
        try {
          await api("/api/drops/reorder", { method: "POST", body: { ids: next.map((d) => d.id) } });
        } catch (err) {
          setDrops(previous);
          throw err;
        }
      }),
  };

  const enabledCount = drops?.filter((d) => d.enabled).length ?? 0;

  return (
    <div>
      <PageHeader
        title="Library"
        action={
          drops && drops.length > 0 ? (
            <p className="pb-1 text-sm text-muted">
              {enabledCount} of {drops.length} in rotation
            </p>
          ) : null
        }
      />

      {loadError && (
        <EmptyState>
          {loadError}{" "}
          <button type="button" onClick={load} className="font-semibold text-volt underline underline-offset-4">
            Retry
          </button>
        </EmptyState>
      )}

      {!drops && !loadError && (
        <div className="flex justify-center py-16 text-muted">
          <Spinner />
        </div>
      )}

      {drops?.length === 0 && <EmptyState>Play a song on Spotify and tap Mark drop when it hits.</EmptyState>}

      {drops && drops.length > 0 && (
        <ul className="flex flex-col gap-2">
          {drops.map((drop, index) => (
            <DropRow
              key={drop.id}
              drop={drop}
              expanded={expandedId === drop.id}
              busy={busyId === drop.id}
              isFirst={index === 0}
              isLast={index === drops.length - 1}
              onExpand={() => setExpandedId((id) => (id === drop.id ? null : drop.id))}
              {...actions}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
