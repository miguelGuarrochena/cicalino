"use client";

/* Extraído de app/(app)/panel/espera/page.tsx. Movido tal cual.
 *
 * Liberar una mesa. El caso interesante es el de mesas juntadas: si el grupo
 * ocupa varias, se ofrece liberarlas todas o solo ésta (el grupo se achicó).
 * Con una sola mesa, es una confirmación y ya.
 *
 * Liberar y avisar los hace el padre. */

import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { formatHora } from "@/lib/espera/slots";
import type { ReservationView, TableView, WaitlistView } from "@/lib/types";

export const LiberarMesaModal = ({
  numero,
  mesa,
  espera,
  reserva,
  tieneGrupo,
  grupoLabel,
  grupoTitulo,
  onLiberarTodas,
  onLiberarSoloEsta,
  onClose,
  locale,
}: {
  numero: number;
  mesa: TableView;
  /* Quién la está ocupando: una espera sentada o una reserva. Puede no haber
   * ninguna (mesa marcada ocupada a mano). */
  espera?: WaitlistView;
  reserva?: ReservationView;
  tieneGrupo: boolean;
  grupoLabel: string;
  grupoTitulo: string;
  onLiberarTodas: () => void;
  onLiberarSoloEsta: () => void;
  onClose: () => void;
  locale: string;
}) => {
  const es = locale !== "en";
  const ocupada = mesa.status === "ocupada";
  const vuelveALibre = es
    ? "La mesa vuelve a quedar libre."
    : "Marks the table as free again.";

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="liberar-title"
      footer={
        <div className="flex flex-col gap-2">
          {tieneGrupo && ocupada ? (
            <>
              <button
                type="button"
                onClick={onLiberarTodas}
                className="w-full rounded-full bg-espera px-5 py-3.5 text-sm font-semibold text-crema transition hover:bg-espera-fuerte"
              >
                {es
                  ? `Liberar todas (${grupoLabel})`
                  : `Free all (${grupoLabel})`}
              </button>
              <button
                type="button"
                onClick={onLiberarSoloEsta}
                className="w-full rounded-full border border-espera/40 bg-espera/10 px-5 py-3.5 text-sm font-semibold text-espera transition hover:bg-espera hover:text-crema"
              >
                {es ? `Solo mesa ${numero}` : `Only table ${numero}`}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onLiberarTodas}
              className="w-full rounded-full bg-espera px-5 py-3.5 text-sm font-semibold text-crema transition hover:bg-espera-fuerte"
            >
              {es ? "Sí, liberar" : "Yes, free it"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full border border-linea px-5 py-3.5 text-sm font-semibold text-carbon transition hover:bg-crema"
          >
            {es ? "Cancelar" : "Cancel"}
          </button>
        </div>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          id="liberar-title"
          className="font-display text-xl uppercase tracking-tight text-carbon"
        >
          {es ? `¿Liberar mesa ${numero}?` : `Free table ${numero}?`}
        </h2>
        <ModalCloseBtn onClick={onClose} label={es ? "Cerrar" : "Close"} />
      </div>
      {ocupada ? (
        <div className="mt-3 rounded-2xl border border-rose-300/40 bg-rose-50/70 px-3.5 py-3 dark:bg-rose-400/10">
          {(espera || reserva) && (
            <>
              <p className="font-display text-lg uppercase tracking-tight text-carbon">
                {espera?.name ?? reserva?.name}
              </p>
              <p className="mt-1 text-sm text-carbon/60">
                {espera
                  ? `${espera.partySize} ${es ? "personas" : "guests"}`
                  : reserva
                    ? `${formatHora(reserva.scheduledAt, locale)} · ${reserva.partySize} ${es ? "personas" : "guests"}`
                    : null}
              </p>
            </>
          )}
          <p className="mt-2 text-sm text-carbon/55">
            {tieneGrupo
              ? es
                ? `${grupoTitulo} juntas. Liberá todas, o solo esta si el grupo se achicó.`
                : `${grupoTitulo} joined. Free all, or only this one if the party got smaller.`
              : vuelveALibre}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-carbon/60">{vuelveALibre}</p>
      )}
    </ModalShell>
  );
};
