"use client";

/* Extraído de app/(app)/panel/espera/page.tsx. Movido tal cual.
 *
 * En la página había dos diálogos de confirmación —cancelar una espera y
 * cancelar una reserva— con el mismo marcado y distinto texto. Es el mismo
 * componente con otros rótulos, así que va uno solo: si algún día cambia el
 * estilo del "¿estás seguro?", cambia en un lugar y no en dos.
 *
 * El botón de confirmar es siempre el destructivo (rojo), porque los dos usos
 * lo son. Si alguna vez hace falta uno no destructivo, se agrega la variante
 * acá y no se duplica el componente. */

import { ModalShell } from "@/components/ui/ModalShell";

export const ConfirmacionModal = ({
  labelledBy,
  titulo,
  detalle,
  confirmar,
  cancelar,
  onConfirmar,
  onClose,
}: {
  labelledBy: string;
  titulo: string;
  detalle: string;
  confirmar: string;
  cancelar: string;
  onConfirmar: () => void;
  onClose: () => void;
}) => (
  <ModalShell onClose={onClose} labelledBy={labelledBy}>
    <h2
      id={labelledBy}
      className="font-display text-xl uppercase tracking-tight text-carbon"
    >
      {titulo}
    </h2>
    <p className="mt-2 text-sm text-carbon/60">{detalle}</p>
    <div className="mt-5 flex flex-col gap-2 sm:flex-row">
      <button
        type="button"
        onClick={onConfirmar}
        className="w-full rounded-full bg-red-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-600"
      >
        {confirmar}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="w-full rounded-full border border-linea px-5 py-3 text-sm font-semibold text-carbon transition hover:bg-crema"
      >
        {cancelar}
      </button>
    </div>
  </ModalShell>
);
