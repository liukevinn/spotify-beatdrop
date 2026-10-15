/** iOS Shortcut setup steps (spec §14), with this deployment's URL filled in. */
export function ShortcutInstructions({ origin, token }: { origin: string; token?: string }) {
  const code = "rounded bg-ink px-1.5 py-0.5 font-mono text-[12px] text-fg break-all";
  return (
    <div className="space-y-4 text-sm leading-relaxed text-muted">
      <div>
        <p className="font-semibold text-fg">Shortcut “Cue Set”</p>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>
            <span className="text-fg">Get Contents of URL</span>: <code className={code}>{origin}/api/cue</code>, Method{" "}
            <code className={code}>POST</code>, Header <code className={code}>Authorization</code> ={" "}
            <code className={code}>Bearer {token ?? "<your token>"}</code>, Request Body JSON (empty).
          </li>
          <li>
            <span className="text-fg">If</span> the result&apos;s <code className={code}>ok</code> has any value →{" "}
            <span className="text-fg">Get Dictionary Value</span> <code className={code}>message</code>; otherwise get{" "}
            <code className={code}>error</code> → <code className={code}>message</code>.
          </li>
          <li>
            <span className="text-fg">Show Notification</span> with that value.
          </li>
        </ol>
      </div>
      <p>
        Bind it: Settings → Action Button → Shortcut → “Cue Set”. Or Settings → Accessibility → Touch → Back Tap →
        Double Tap.
      </p>
      <p>
        Optional: a “Mark Drop” shortcut posting to <code className={code}>{origin}/api/drops/mark</code> (works with
        Siri), and “Nudge Later” posting <code className={code}>{`{ "deltaMs": 1000 }`}</code> to{" "}
        <code className={code}>{origin}/api/cue/nudge-last</code>.
      </p>
    </div>
  );
}
