/** 83412 → "1:23.4" (truncated to tenths so it never rounds past the real time). */
export function formatMs(ms: number): string {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths % 10}`;
}

/** 20000 → "20s", 12500 → "13s" (rounded to whole seconds for spoken/notification text). */
export function formatLeadSeconds(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}

/** "3 min ago", "just now", "2 h ago", "Mar 4". */
export function formatTimeAgo(iso: string, now: Date = new Date()): string {
  const diffSec = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (diffSec < 45) return "just now";
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** 210000 → "3:30", 95400 → "1:35" (whole seconds, for rest times and countdowns). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
