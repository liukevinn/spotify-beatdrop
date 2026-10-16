import { redirect } from "next/navigation";
import { pill, SpotifyIcon } from "@/components/ui";
import { getSessionUserId } from "@/lib/auth/session";
import { getUserById } from "@/lib/db/users";
import { ERRORS, type ErrorCode } from "@/lib/errors";

const LOGIN_ERRORS: Record<string, string> = {
  ACCESS_DENIED: "Spotify login was cancelled.",
  STATE_MISMATCH: "Login expired. Try again.",
  LOGIN_FAILED: "Login failed. Try again.",
};

function errorText(code: string | undefined): string | null {
  if (!code) return null;
  if (code in LOGIN_ERRORS) return LOGIN_ERRORS[code]!;
  if (code in ERRORS) return ERRORS[code as ErrorCode].message;
  return LOGIN_ERRORS.LOGIN_FAILED!;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const userId = await getSessionUserId();
  if (userId) {
    const user = await getUserById(userId);
    if (user && !user.needs_reauth) redirect("/");
  }
  const error = errorText((await searchParams).error);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-between px-safe pt-safe pb-safe">
      <div className="pt-[18vh]">
        <p className="text-sm font-bold text-muted">DropSet</p>
        <h1 className="mt-3 text-[40px] font-bold leading-[1.05] tracking-tight">
          Unrack
          <br />
          on the drop.
        </h1>
        <p className="mt-5 max-w-xs text-base leading-relaxed text-muted">
          Keep your music going while you rest. Your next song hits its drop the moment the rest ends.
        </p>
      </div>

      <div className="pb-8">
        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-surface px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
        {/* Plain <a>: the API route redirects to Spotify. */}
        <a href="/api/auth/login" className={`${pill.primary} min-h-14 w-full text-base`}>
          <SpotifyIcon className="h-6 w-6" />
          Continue with Spotify
        </a>
        <p className="mt-4 text-center text-xs text-faint">Requires Spotify Premium. Not affiliated with Spotify.</p>
      </div>
    </main>
  );
}
