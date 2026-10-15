"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { PageHeader } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { DeviceSection } from "./DeviceSection";
import { PlaybackSection } from "./PlaybackSection";
import { TokensSection } from "./TokensSection";

export function SettingsScreen() {
  const toast = useToast();
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    setLoggingOut(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
      window.location.assign("/login");
    } catch (err) {
      toast(errorMessage(err), "error");
      setLoggingOut(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Settings" />
      <DeviceSection />
      <PlaybackSection />
      <TokensSection />
      <button
        type="button"
        onClick={logout}
        disabled={loggingOut}
        className="mt-2 min-h-12 rounded-2xl border border-line font-semibold text-muted active:bg-raised disabled:opacity-50"
      >
        Log out
      </button>
    </div>
  );
}
