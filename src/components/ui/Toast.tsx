"use client";

import { createContext, useCallback, useContext, useState } from "react";

type ToastKind = "info" | "success" | "error";
interface ToastItem {
  id: number;
  msg: string;
  kind: ToastKind;
}
interface ToastCtx {
  toast: (msg: string, kind?: ToastKind) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

const DOT: Record<ToastKind, string> = {
  info: "bg-marca",
  success: "bg-emerald-500",
  error: "bg-red-500",
};

let seq = 0;

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((msg: string, kind: ToastKind = "info") => {
    const id = ++seq;
    setItems((v) => [...v, { id, msg, kind }]);
    setTimeout(() => setItems((v) => v.filter((t) => t.id !== id)), 3200);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6"
        role="region"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className="u-pop pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-full border border-linea bg-surface px-4 py-2.5 text-sm font-medium text-carbon shadow-lg"
          >
            <span className={`size-2 shrink-0 rounded-full ${DOT[t.kind]}`} />
            <span className="truncate">{t.msg}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
};

// Devuelve una función toast(); si se usa fuera del provider, es un noop seguro.
export const useToast = () => {
  const c = useContext(Ctx);
  return c?.toast ?? (() => {});
};
