export interface DayGroup<T> {
  key: string;
  label: string;
  items: T[];
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Groups newest-first items by local calendar day, labelling today/yesterday. */
export function groupByDay<T extends { cuedAt: string }>(items: T[], now: Date = new Date()): DayGroup<T>[] {
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const groups: DayGroup<T>[] = [];

  for (const item of items) {
    const date = new Date(item.cuedAt);
    const key = dayKey(date);
    let group = groups.at(-1);
    if (group?.key !== key) {
      const label =
        key === today
          ? "Today"
          : key === yesterday
            ? "Yesterday"
            : date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
      group = { key, label, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}
