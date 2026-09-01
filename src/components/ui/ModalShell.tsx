"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Spinner } from "@/components/ui/Spinner";
import { enfocablesDe, siguienteFoco } from "@/lib/ui/focusTrap";

export const ModalShell = ({
  children,
  footer,
  onClose,
  labelledBy,
  busy = false,
  busyLabel,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  labelledBy?: string;
  busy?: boolean;
  busyLabel?: string;
}) => {
  const capaRef = useRef<HTMLDivElement>(null);
  const volverA = useRef<HTMLElement | null | undefined>(undefined);

  /* Quién tenía el foco antes de que existiera el modal.
   *
   * Se lee en el primer render y no en el efecto de montaje: para cuando corre
   * el efecto, React ya aplicó el `autoFocus` de los modales que traen un
   * input, así que ahí `document.activeElement` es un elemento de adentro del
   * modal y al cerrar no habría a dónde volver. Es una lectura, no un cambio:
   * el DOM del modal todavía no se montó. */
  if (volverA.current === undefined) {
    volverA.current =
      typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  }

  /* Montaje y desmontaje: scroll, foco inicial y devolución del foco.
   *
   * Va en su propio efecto, sin dependencias, porque si se mezclara con el del
   * teclado —que sí depende de `busy` y `onClose`— cada cambio de esos
   * devolvería el foco al disparador en medio del modal abierto. */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    /* Solo si nadie se adelantó: seis de los modales traen un input con
     * autoFocus, que React ya aplicó cuando corre este efecto. Pisarlo
     * mandaría el foco al botón de cerrar en vez de al campo. */
    const capa = capaRef.current;
    if (capa && !capa.contains(document.activeElement)) {
      const [primero] = enfocablesDe(capa);
      (primero ?? capa).focus();
    }

    return () => {
      document.body.style.overflow = prev;
      const destino = volverA.current;
      /* Si el disparador se fue del DOM mientras el modal estaba abierto no
       * hay a dónde volver, y enfocar un nodo suelto no hace nada. */
      if (destino && document.contains(destino)) destino.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const capa = capaRef.current;
      if (!capa) return;
      const lista = enfocablesDe(capa);
      const actual =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      const destino = siguienteFoco(lista, actual, e.shiftKey);
      /* null = el foco está en el medio: lo mueve el navegador. */
      if (!destino) return;
      e.preventDefault();
      destino.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={capaRef}
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
        /* Para que el contenedor pueda recibir el foco cuando el modal no
           tiene ningún control enfocable adentro. */
        tabIndex={-1}
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
