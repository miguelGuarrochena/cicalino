"use client";

import { Skeleton } from "@/components/ui/Skeleton";
import { mesaTileClass } from "@/components/panel/espera/mesaTileClass";
import { isReservationHolding, reservationTime } from "@/lib/reservations";
import type {
  ReservationView,
  TableView,
  WaitlistView,
} from "@/lib/types";

/* El mapa de mesas de la sala.
 *
 * Salió de espera/page.tsx tal cual, sin cambiar una clase ni una condición.
 * Era el bloque de JSX más grande de esa pantalla y no toma ninguna decisión
 * de negocio: recibe las mesas ya filtradas y a quién pertenece cada una, y
 * avisa hacia arriba qué se tocó. Las cinco llamadas a setState que había en
 * el onClick de una mesa libre pasaron a ser un solo `onOcupar`, porque abrir
 * el modal de ocupar es cosa de la pantalla, no del mapa.
 */
interface Props {
  mesas: TableView[];
  mesasFiltradas: TableView[];
  reservaPorMesa: Map<number, ReservationView>;
  esperaById: Map<string, WaitlistView>;
  reservaById: Map<string, ReservationView>;
  ahora: number;
  ready: boolean;
  locale: string;
  /* Mesa libre dentro de la ventana de una reserva: se gestiona la reserva. */
  onHold: (reservaId: string) => void;
  onOcupar: (mesa: TableView) => void;
  onLiberar: (numero: number) => void;
}

export const MapaMesas = ({
  mesas,
  mesasFiltradas,
  reservaPorMesa,
  esperaById,
  reservaById,
  ahora,
  ready,
  locale,
  onHold,
  onOcupar,
  onLiberar,
}: Props) => {
  return (
    <section className="rounded-[24px] border border-espera/20 bg-surface p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap gap-3 text-[10px] font-semibold uppercase tracking-wide text-carbon/50">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-espera" />
          {locale === "en" ? "Free" : "Libre"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border-2 border-amber-500 bg-espera" />
          {locale === "en" ? "Free · booked later" : "Libre · con reserva"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-amber-400" />
          {locale === "en" ? "Reserved now" : "Reservada ahora"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-rose-600" />
          {locale === "en" ? "Busy" : "Ocupada"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border-2 border-amber-500 bg-rose-600" />
          {locale === "en" ? "Busy · booked later" : "Ocup. · con reserva"}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
        {/* Sin la primera carga no se sabe si la sala está sin mesas o si
            todavía no llegaron: el cartel de "definí la cantidad" mandaba a
            Configuración a locales que sí las tenían. */}
        {!ready &&
          Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-2xl" />
          ))}
        {mesasFiltradas.map((m) => {
          const espera =
            m.waitlistId != null ? esperaById.get(m.waitlistId) : undefined;
          const reservaSentada =
            m.reservationId != null ? reservaById.get(m.reservationId) : undefined;
          const libre = m.status === "libre";
          const reservaProx = reservaPorMesa.get(m.number);
          const holding = reservaProx
            ? isReservationHolding(reservaProx, ahora)
            : false;
          const conReserva = !!reservaProx && !holding;
          const etiquetaGrupo = libre
            ? reservaProx?.name
            : (espera?.name ?? reservaSentada?.name);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                if (libre && holding && reservaProx) {
                  onHold(reservaProx.id);
                  return;
                }
                if (libre) {
                  onOcupar(m);
                  return;
                }
                onLiberar(m.number);
              }}
              title={
                reservaProx
                  ? libre
                    ? holding
                      ? locale === "en"
                        ? `Reserved ${reservationTime(reservaProx.scheduledAt)} — ${reservaProx.name} · tap to manage`
                        : `Reservada ${reservationTime(reservaProx.scheduledAt)} — ${reservaProx.name} · tocar para gestionar`
                      : locale === "en"
                        ? `Free now · booking ${reservationTime(reservaProx.scheduledAt)} (${reservaProx.name})`
                        : `Libre ahora · reserva ${reservationTime(reservaProx.scheduledAt)} (${reservaProx.name})`
                    : locale === "en"
                      ? `Busy · booking ${reservationTime(reservaProx.scheduledAt)} (${reservaProx.name}) — tap to free`
                      : `Ocupada · reserva ${reservationTime(reservaProx.scheduledAt)} (${reservaProx.name}) — tocar para liberar`
                  : libre
                    ? locale === "en"
                      ? "Tap to seat now"
                      : "Tocar para sentar"
                    : locale === "en"
                      ? "Tap to free"
                      : "Tocar para liberar"
              }
              className={mesaTileClass(m.status, {
                pickable: true,
                conReserva,
                reservaHold: holding,
              })}
            >
              {reservaProx && (
                <span
                  className={`absolute -top-1.5 left-1/2 z-10 -translate-x-1/2 rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none shadow-sm ${
                    holding
                      ? "bg-amber-950 text-amber-100"
                      : "bg-amber-400 text-amber-950"
                  }`}
                >
                  {reservationTime(reservaProx.scheduledAt)}
                </span>
              )}
              <span className="font-display text-lg leading-none">
                {m.number}
              </span>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-wide opacity-90">
                {holding
                  ? locale === "en"
                    ? "Booked"
                    : "Reserva"
                  : libre
                    ? locale === "en"
                      ? "Free"
                      : "Libre"
                    : locale === "en"
                      ? "Busy"
                      : "Ocup."}
              </span>
              <span className="mt-0.5 text-[9px] font-semibold opacity-80">
                {m.capacity ?? 4}p
              </span>
              {(etiquetaGrupo || (reservaProx && !libre)) && (
                <span className="mt-0.5 max-w-full truncate px-1 text-[9px] font-medium opacity-80">
                  {!libre && reservaProx
                    ? `${etiquetaGrupo ? `${etiquetaGrupo} · ` : ""}${reservationTime(reservaProx.scheduledAt)}`
                    : etiquetaGrupo}
                </span>
              )}
            </button>
          );
        })}
        {ready && !mesas.length && (
          <p className="col-span-full text-sm text-carbon/50">
            {locale === "en"
              ? "Set table count in Settings."
              : "Definí la cantidad de mesas en Configuración."}
          </p>
        )}
        {ready && !!mesas.length && !mesasFiltradas.length && (
          <p className="col-span-full py-6 text-center text-sm text-carbon/50">
            {locale === "en"
              ? "No tables match this filter."
              : "Ninguna mesa con este filtro."}
          </p>
        )}
      </div>
    </section>
  );
};
