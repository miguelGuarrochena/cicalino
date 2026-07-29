"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Spinner } from "@/components/ui/Spinner";

// Overlay centrado en el viewport (portal a body). Evita que un padre con
// transform (animaciones .u-in) rompa position:fixed y lo baje al final.
// En mobile: sheet desde abajo (pulgar cerca de Guardar) + safe-area.
export const ModalShell = ({
  children,
  footer,
  onClose,
  labelledBy,
  busy = false,
  busyLabel,
}: {
  children: React.ReactNode;
  /** Acciones fijas abajo (Guardar / Cancelar) — no scrollean con el cuerpo. */
  footer?: React.ReactNode;
  onClose: () => void;
  labelledBy?: string;
  /** Mientras guarda/verifica: no cerrar con Esc ni click afuera. */
  busy?: boolean;
  /** Texto bajo el spinner (ej. "Enviando condiciones…"). */
  busyLabel?: string;
}) => {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, busy]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Cerrar"
        disabled={busy}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm disabled:cursor-wait"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-busy={busy || undefined}
        className="u-pop relative z-10 flex max-h-[min(92dvh,760px)] w-full max-w-none flex-col overflow-hidden rounded-t-[24px] border border-linea border-b-0 bg-surface shadow-2xl sm:max-w-lg sm:rounded-[28px] sm:border-b"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 justify-center pb-1 pt-2.5 sm:hidden"
          aria-hidden="true"
        >
          <span className="h-1 w-10 rounded-full bg-carbon/20" />
        </div>
        <div
          className={`u-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-2 sm:p-6 sm:pt-6 ${
            busy ? "pointer-events-none select-none" : ""
          }`}
        >
          {children}
        </div>
        {footer ? (
          <div
            className={`shrink-0 border-t border-linea bg-surface/95 px-5 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-3.5 backdrop-blur-sm sm:px-6 sm:pb-4 sm:pt-4 ${
              busy ? "pointer-events-none opacity-60" : ""
            }`}
          >
            {footer}
          </div>
        ) : (
          <div
            className="shrink-0 pb-[env(safe-area-inset-bottom)] sm:hidden"
            aria-hidden="true"
          />
        )}
        {busy ? (
          <div
            className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-surface/75 backdrop-blur-[2px]"
            role="status"
            aria-live="polite"
          >
            <Spinner className="h-14" />
            <p className="px-6 text-center text-sm font-semibold text-carbon">
              {busyLabel || "Trabajando…"}
            </p>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
};
