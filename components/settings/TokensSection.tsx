"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { Card, pill, SectionLabel, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { formatTimeAgo } from "@/lib/logic/format";
import type { TokenInfo } from "@/lib/types";
import { ShortcutInstructions } from "./ShortcutInstructions";

function NewTokenModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-token-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
    >
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-xl bg-surface px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-xl">
        <h2 id="new-token-title" className="text-xl font-bold">
          Your shortcut token
        </h2>
        <p className="mt-1 text-sm text-warn">Copy it now. It won&apos;t be shown again.</p>

        <div className="mt-4 rounded-md bg-ink p-3 font-mono text-[13px] break-all text-fg select-all">{token}</div>
        <button type="button" onClick={copy} className={`${pill.primary} mt-3 min-h-12 w-full`}>
          {copied ? "Copied ✓" : "Copy token"}
        </button>

        <div className="mt-6 border-t border-raised pt-5">
          <ShortcutInstructions origin={origin} token={token} />
        </div>

        <button type="button" onClick={onClose} className={`${pill.secondary} mt-6 min-h-12 w-full`}>
          Done
        </button>
      </div>
    </div>
  );
}

export function TokensSection() {
  const toast = useToast();
  const [tokens, setTokens] = useState<TokenInfo[] | null>(null);
  const [label, setLabel] = useState("iPhone");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTokens((await api<{ tokens: TokenInfo[] }>("/api/tokens")).tokens);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api<{ id: string; token: string }>("/api/tokens", { method: "POST", body: { label } });
      setNewToken(res.token);
      void load();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (token: TokenInfo) => {
    try {
      await api(`/api/tokens/${token.id}`, { method: "DELETE" });
      setTokens((prev) => prev?.filter((t) => t.id !== token.id) ?? null);
      toast(`Revoked “${token.label}”`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <Card>
      <SectionLabel>Shortcut tokens</SectionLabel>
      <p className="-mt-1 mb-3 text-sm text-muted">
        Lets an iOS Shortcut start a rest from the Action button, even with the phone locked.
      </p>

      <form onSubmit={create} className="flex gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={60}
          required
          aria-label="Token label"
          placeholder="Label"
          className="min-h-11 min-w-0 flex-1 rounded-full bg-raised px-4 text-[16px] outline-none focus:ring-2 focus:ring-fg"
        />
        <button type="submit" disabled={creating || !label.trim()} className={`${pill.primary} min-h-11 shrink-0 px-5`}>
          {creating && <Spinner />} Create
        </button>
      </form>

      {tokens && tokens.length > 0 && (
        <ul className="mt-4 flex flex-col">
          {tokens.map((token) => (
            <li key={token.id} className="flex min-h-14 items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{token.label}</span>
                <span className="block text-xs text-muted">
                  {token.lastUsedAt ? `Used ${formatTimeAgo(token.lastUsedAt)}` : "Never used"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => revoke(token)}
                className={`${pill.secondary} min-h-8 shrink-0 px-3 text-[13px]`}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      {newToken && <NewTokenModal token={newToken} onClose={() => setNewToken(null)} />}
    </Card>
  );
}
