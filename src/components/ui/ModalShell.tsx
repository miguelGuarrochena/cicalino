"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

// Overlay centrado en el viewport (portal a body). Evita que un padre con
// transform (animaciones .u-in) rompa position:fixed y lo baje al final.
export const ModalShell = ({
  children,
  onClose,
  labelledBy,
}: {
  children: React.ReactNode;
  onClose: () => void;
  labelledBy?: string;
}) => {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
          };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="u-pop relative z-10 max-h-[min(90dvh,720px)] w-full max-w-md overflow-y-auto overscroll-contain rounded-[28px] border border-linea bg-surface p-5 shadow-2xl sm:max-w-lg sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
};
