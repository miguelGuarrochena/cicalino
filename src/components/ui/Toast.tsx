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

/* En el celular el color vive en el puntito y alcanza: la pantalla está a
 * treinta centímetros de la cara. En la tablet del mostrador y en el monitor
 * el aviso se mira de reojo y desde lejos, así que ahí el color se toma el
 * borde y un halo alrededor del punto. */
const BORDE: Record<ToastKind, string> = {
  info: "grande:border-marca/45",
  success: "grande:border-emerald-500/50",
  error: "grande:border-red-500/50",
};

const HALO: Record<ToastKind, string> = {
  info: "grande:ring-marca/20",
  success: "grande:ring-emerald-500/20",
  error: "grande:ring-red-500/20",
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
        className="pointer-events-none fixed inset-x-0 top-[4.25rem] z-[220] flex flex-col items-center gap-2 px-4 sm:top-[4.75rem] grande:top-[5.5rem] grande:gap-3"
        role="region"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`u-pop pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-2xl border border-linea bg-crema/95 px-4 py-3 text-sm font-medium text-carbon shadow-lg backdrop-blur-md grande:max-w-2xl grande:gap-4 grande:rounded-[28px] grande:border-2 grande:px-7 grande:py-5 grande:text-lg grande:font-semibold grande:shadow-2xl ${BORDE[t.kind]}`}
          >
            <span
              className={`size-2.5 shrink-0 rounded-full grande:size-4 grande:ring-4 ${DOT[t.kind]} ${HALO[t.kind]}`}
            />
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
