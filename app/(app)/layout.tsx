import { redirect } from "next/navigation";
import { TabBar } from "@/components/TabBar";
import { getSessionUserId } from "@/lib/auth/session";
import { getUserById } from "@/lib/db/users";

/** Shell for every signed-in screen: auth gate, re-login banner, bottom tabs. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await getSessionUserId();
  const user = userId ? await getUserById(userId) : null;
  if (!user) redirect("/login");

  return (
    <div className="mx-auto min-h-dvh max-w-md px-safe pt-safe pb-28">
      {user.needs_reauth && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          <span>Spotify access expired. Log in to DropSet again.</span>
          {/* Plain <a>: this is a server redirect, not a client route. */}
          <a href="/api/auth/login" className="shrink-0 rounded-lg bg-danger px-3 py-2 font-semibold text-ink">
            Log in
          </a>
        </div>
      )}
      {children}
      <TabBar />
    </div>
  );
}
