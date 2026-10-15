"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Tone = "info" | "error";
interface ToastState {
  id: number;
  message: string;
  tone: Tone;
}

const TOAST_MS = 3200;
const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const nextId = useRef(0);

  const show = useCallback((message: string, tone: Tone = "info") => {
    nextId.current += 1;
    setToast({ id: nextId.current, message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-safe pt-safe"
      >
        {toast && (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto mt-2 w-full max-w-md rounded-2xl border px-4 py-3 text-[15px] font-medium shadow-2xl backdrop-blur ${
              toast.tone === "error"
                ? "border-danger/40 bg-danger/15 text-danger"
                : "border-volt/30 bg-raised/95 text-fg"
            }`}
            onClick={() => setToast(null)}
          >
            {toast.message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
