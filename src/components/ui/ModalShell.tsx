"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

// Overlay centrado en el viewport (portal a body). Evita que un padre con
// transform (animaciones .u-in) rompa position:fixed y lo baje al final.
export const ModalShell = ({
  children,
  footer,
  onClose,
  labelledBy,
  busy = false,
}: {
  children: React.ReactNode;
  /** Acciones fijas abajo (Guardar / Cancelar) — no scrollean con el cuerpo. */
  footer?: React.ReactNode;
  onClose: () => void;
  labelledBy?: string;
  /** Mientras guarda/verifica: no cerrar con Esc ni click afuera. */
  busy?: boolean;
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
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4"
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
        className="u-pop relative z-10 flex max-h-[min(92dvh,760px)] w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-linea bg-surface shadow-2xl sm:max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="u-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-linea bg-surface/95 px-5 py-3.5 backdrop-blur-sm sm:px-6 sm:py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
};
