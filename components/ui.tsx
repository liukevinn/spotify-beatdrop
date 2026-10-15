import Link from "next/link";

export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <header className="flex items-end justify-between pb-4 pt-2">
      <h1 className="font-display text-[28px] font-bold tracking-tight">{title}</h1>
      {action}
    </header>
  );
}

export function Card({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>{children}</section>;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">{children}</h2>;
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
      aria-hidden
    />
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-[15px] leading-relaxed text-muted">
      {children}
    </div>
  );
}

export function Notice({
  tone = "warn",
  children,
  href,
  linkLabel,
}: {
  tone?: "warn" | "danger";
  children: React.ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  const color = tone === "danger" ? "border-danger/40 bg-danger/10 text-danger" : "border-warn/40 bg-warn/10 text-warn";
  return (
    <div className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${color}`}>
      <span>{children}</span>
      {href && linkLabel && (
        <Link href={href} className="shrink-0 font-semibold underline underline-offset-4">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}
