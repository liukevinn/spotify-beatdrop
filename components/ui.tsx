import Link from "next/link";

/** Spotify-style buttons: everything is a pill. */
export const pill = {
  /** Green, black text: the one main action on a screen. */
  primary:
    "inline-flex items-center justify-center gap-2 rounded-full bg-accent font-bold text-ink transition-transform active:scale-[0.97] active:bg-accent-press disabled:opacity-50",
  /** Outlined white: secondary actions. */
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-full border border-faint font-bold text-fg transition-transform active:scale-[0.97] active:border-fg disabled:opacity-40",
  /** Filled grey: compact controls (nudges, steppers). */
  subtle:
    "inline-flex items-center justify-center gap-2 rounded-full bg-raised font-semibold text-fg active:bg-line disabled:opacity-40",
} as const;

export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <header className="flex items-end justify-between pb-4 pt-3">
      <h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
      {action}
    </header>
  );
}

export function Card({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <section className={`rounded-lg bg-surface p-4 ${className}`}>{children}</section>;
}

/** Section title in Spotify's style: bold, sentence case. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-lg font-bold tracking-tight text-fg">{children}</h2>;
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
  return <div className="rounded-lg bg-surface px-6 py-12 text-center text-[15px] leading-relaxed text-muted">{children}</div>;
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
  const dot = tone === "danger" ? "bg-danger" : "bg-warn";
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-surface px-4 py-3 text-sm">
      <span className="flex items-center gap-2.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
        {children}
      </span>
      {href && linkLabel && (
        <Link href={href} className={`${pill.secondary} min-h-8 shrink-0 px-3 text-[13px]`}>
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

/** The Spotify icon (official mark, unmodified), for the attribution Spotify's guidelines require. */
export function SpotifyIcon({ className = "h-[21px] w-[21px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="currentColor" role="img" aria-label="Spotify">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

/** "Open in Spotify" link back to a track (required wherever Spotify content is shown). */
export function OpenInSpotify({ trackId }: { trackId: string }) {
  return (
    <a
      href={`https://open.spotify.com/track/${encodeURIComponent(trackId)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-8 items-center gap-2 text-[13px] font-semibold text-muted active:text-fg"
    >
      <SpotifyIcon />
      Open Spotify
    </a>
  );
}

/** Page-level attribution: Spotify supplies all track metadata and playback. */
export function SpotifyAttribution() {
  return (
    <p className="mt-8 flex items-center justify-center gap-2 text-xs text-faint">
      <SpotifyIcon className="h-[21px] w-[21px] text-muted" />
      Music data and playback by Spotify
    </p>
  );
}
