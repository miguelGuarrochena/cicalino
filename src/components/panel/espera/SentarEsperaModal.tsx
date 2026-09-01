"use client";

/* Extraído de app/(app)/panel/espera/page.tsx. Movido tal cual.
 *
 * Elegir en qué mesa(s) sentar a un grupo de la cola. Se pueden juntar varias:
 * lo que manda es que la suma de plazas alcance para el grupo.
 *
 * El orden de las mesas no es por número: primero las libres que mejor entran
 * (la de 4 antes que la de 10 para un grupo de 3), para no quemar una mesa
 * grande con un grupo chico. Las ocupadas van al final y no se pueden tocar. */

import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { AvisoReserva } from "@/components/panel/espera/AvisoReserva";
import { mesaTileClass } from "@/components/panel/espera/mesaTileClass";
import { isReservationHolding, reservationTime } from "@/lib/reservations";
import { tablesTitle, type ReservationView, type TableView, type WaitlistView } from "@/lib/types";

/* Libres primero, ordenadas por lo justo que le quedan al grupo; después el
 * resto por número. */
const ordenarMesas = (mesas: TableView[], need: number): TableView[] => {
  const peso = (m: TableView) => {
    const c = m.capacity ?? 4;
    return c >= need ? c - need : 1000 + (need - c);
  };
  const libres = mesas
    .filter((m) => m.status === "libre")
    .sort((a, b) => peso(a) - peso(b) || a.number - b.number);
  const resto = mesas
    .filter((m) => m.status !== "libre")
    .sort((a, b) => a.number - b.number);
  return [...libres, ...resto];
};

export const SentarEsperaModal = ({
  espera,
  mesas,
  seleccion,
  onSeleccion,
  reservaPorMesa,
  avisos,
  ahora,
  locale,
  onSentar,
  onClose,
}: {
  espera?: WaitlistView;
  mesas: TableView[];
  seleccion: number[];
  onSeleccion: (fn: (prev: number[]) => number[]) => void;
  reservaPorMesa: Map<number, ReservationView>;
  avisos: { number: number; reserva: ReservationView }[];
  ahora: number;
  locale: string;
  onSentar: () => void;
  onClose: () => void;
}) => {
  const es = locale !== "en";
  const lang = es ? "es" : "en";
  const need = espera?.partySize ?? 1;
  const plazasElegidas = mesas
    .filter((m) => seleccion.includes(m.number))
    .reduce((s, m) => s + (m.capacity ?? 4), 0);
  const alcanza = plazasElegidas >= need;

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="sentar-title"
      footer={
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={!seleccion.length || !alcanza}
            onClick={onSentar}
            className={`w-full rounded-full px-5 py-3.5 text-sm font-semibold text-crema transition disabled:opacity-40 ${
              avisos.length
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-espera hover:bg-espera-fuerte"
            }`}
          >
            {avisos.length
              ? es
                ? "Sentar igual"
                : "Seat anyway"
              : es
                ? "Sentar"
                : "Seat"}
          </button>
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
          id="sentar-title"
          className="font-display text-xl uppercase tracking-tight text-carbon"
        >
          {es ? `Sentar a ${espera?.name ?? ""}` : `Seat ${espera?.name ?? ""}`}
        </h2>
        <ModalCloseBtn onClick={onClose} label={es ? "Cerrar" : "Close"} />
      </div>

      <p className="mt-2 mb-1 text-sm text-carbon/55">
        {es
          ? `Grupo de ${espera?.partySize ?? "?"}. Primero las que mejor entran; las más grandes las decidís vos.`
          : `Party of ${espera?.partySize ?? "?"}. Best-fit tables first — larger ones stay available.`}
      </p>

      <p
        className={`mb-3 text-sm font-semibold ${
          alcanza ? "text-espera" : "text-curso"
        }`}
      >
        {es
          ? `${plazasElegidas} / ${need} plazas elegidas`
          : `${plazasElegidas} / ${need} seats selected`}
        {seleccion.length > 1 ? ` · ${tablesTitle(seleccion, lang)}` : ""}
      </p>

      <div className="mb-3 flex flex-wrap gap-3 text-[10px] font-semibold uppercase tracking-wide text-carbon/50">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-espera" />
          {es ? "Libre" : "Free"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border-2 border-amber-500 bg-espera" />
          {es ? "Libre · con reserva" : "Free · has booking"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-rose-600" />
          {es ? "Ocupada" : "Busy"}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {ordenarMesas(mesas, need).map((m) => {
          const libre = m.status === "libre";
          const selected = seleccion.includes(m.number);
          const cap = m.capacity ?? 4;
          const oversized = libre && cap > need;
          const reservaProx = libre ? reservaPorMesa.get(m.number) : undefined;
          const holding = reservaProx
            ? isReservationHolding(reservaProx, ahora)
            : false;
          const bloqueada = !libre || holding;
          return (
            <button
              key={m.id}
              type="button"
              disabled={bloqueada}
              onClick={() => {
                if (bloqueada) return;
                onSeleccion((prev) =>
                  prev.includes(m.number)
                    ? prev.filter((n) => n !== m.number)
                    : [...prev, m.number].sort((a, b) => a - b),
                );
              }}
              className={mesaTileClass(m.status, {
                pickable: !bloqueada,
                selected: libre && selected && !holding,
                oversized,
                conReserva: !!reservaProx && !holding,
                reservaHold: holding,
              })}
            >
              {reservaProx && !selected && (
                <span
                  className={`absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none shadow-sm ${
                    holding
                      ? "bg-amber-950 text-amber-100"
                      : "bg-amber-400 text-amber-950"
                  }`}
                >
                  {reservationTime(reservaProx.scheduledAt)}
                </span>
              )}
              <span className="font-display text-xl leading-none">
                {m.number}
              </span>
              <span className="mt-1 text-[9px] font-bold uppercase tracking-wide opacity-90">
                {holding
                  ? es
                    ? "Reserva"
                    : "Booked"
                  : libre
                    ? es
                      ? "Libre"
                      : "Free"
                    : es
                      ? "Ocup."
                      : "Busy"}
              </span>
              <span className="mt-0.5 text-[9px] font-semibold opacity-80">
                {cap}p
              </span>
            </button>
          );
        })}
      </div>

      <AvisoReserva avisos={avisos} locale={locale} ahora={ahora} />
    </ModalShell>
  );
};
