"use client";

import { createContext, useCallback, useContext, useState } from "react";

type ToastKind = "info" | "success" | "error";
interface ToastItem {
  id: number;
  msg: string;
  kind: ToastKind;
}
interface ToastCtx {
  toast: (msg: string, kind?: ToastKind, ms?: number) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

const DOT: Record<ToastKind, string> = {
  info: "bg-marca",
  success: "bg-emerald-500",
  error: "bg-red-500",
};

let seq = 0;
const TOAST_MS = 3200;
/* El aviso de “llamalo vos” es más largo: si se va al toque, en el
 * mostrador no se llega a leer. */
export const TOAST_AVISO_MS = 5_200;

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback(
    (msg: string, kind: ToastKind = "info", ms: number = TOAST_MS) => {
      const id = ++seq;
      setItems((v) => [...v, { id, msg, kind }]);
      window.setTimeout(
        () => setItems((v) => v.filter((t) => t.id !== id)),
        ms,
      );
    },
    [],
  );

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-[4.25rem] z-[220] flex flex-col items-center gap-2 px-4 sm:top-[4.75rem]"
        role="region"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className="u-pop pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-2xl border border-linea bg-crema/95 px-4 py-3 text-sm font-medium text-carbon shadow-lg backdrop-blur-md"
          >
            <span className={`size-2.5 shrink-0 rounded-full ${DOT[t.kind]}`} />
            <span className="leading-snug">{t.msg}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
};

export const useToast = () => {
  const c = useContext(Ctx);
  return c?.toast ?? (() => {});
};
