"use client";

import { useEffect, useState } from "react";
import { EmptyState, PageHeader, SectionLabel, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { formatClock, formatLeadSeconds, formatMs } from "@/lib/logic/format";
import { groupByDay } from "@/lib/logic/history";
import type { SetRecord } from "@/lib/types";

const HISTORY_LIMIT = 100;

export function HistoryScreen() {
  const [sets, setSets] = useState<SetRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ sets: SetRecord[] }>(`/api/sets?limit=${HISTORY_LIMIT}`).then(
      (res) => setSets(res.sets),
      (err) => setError(errorMessage(err)),
    );
  }, []);

  return (
    <div>
      <PageHeader title="History" />

      {error && <EmptyState>{error}</EmptyState>}
      {!sets && !error && (
        <div className="flex justify-center py-16 text-muted">
          <Spinner />
        </div>
      )}
      {sets?.length === 0 && <EmptyState>No sets yet. Tap Start rest at the gym and they&apos;ll show up here.</EmptyState>}

      <div className="flex flex-col gap-6">
        {sets &&
          groupByDay(sets).map((group) => (
            <section key={group.key}>
              <SectionLabel>
                {group.label} · {group.items.length} {group.items.length === 1 ? "set" : "sets"}
              </SectionLabel>
              <ol className="flex flex-col">
                {group.items.map((set) => (
                  <li key={set.id} className="flex items-center gap-3 py-2.5">
                    <time dateTime={set.cuedAt} className="w-16 shrink-0 text-sm tabular-nums text-muted">
                      {new Date(set.cuedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </time>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-medium">{set.trackName}</span>
                      <span className="block text-sm text-muted">
                        from <span className="tabular-nums">{formatMs(set.positionMs)}</span>
                        {set.source === "shortcut" ? " · Shortcut" : ""}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-raised px-3 py-1 text-xs font-semibold tabular-nums text-fg">
                      {set.leadMs >= 60_000 ? `${formatClock(set.leadMs)} rest` : formatLeadSeconds(set.leadMs)}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
      </div>
    </div>
  );
}
