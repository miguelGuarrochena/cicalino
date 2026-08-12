"use client";

/* Extraído de app/(app)/panel/espera/page.tsx. Movido tal cual. */

import { reservationTime, timeUntilLabel } from "@/lib/reservations";
import type { ReservationView } from "@/lib/types";

export const AvisoReserva = ({
  avisos,
  locale,
  ahora,
}: {
  avisos: { number: number; reserva: ReservationView }[];
  locale: string;
  ahora: number;
}) => {
  if (!avisos.length) return null;
  return (
    <div className="mt-4 rounded-2xl border border-amber-400/60 bg-amber-50/80 px-3.5 py-3 dark:bg-amber-400/10">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
        {locale === "en"
          ? avisos.length === 1
            ? "This table has a booking"
            : "These tables have bookings"
          : avisos.length === 1
            ? "Esta mesa tiene reserva"
            : "Estas mesas tienen reserva"}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {avisos.map(({ number, reserva }) => (
          <li key={`${number}-${reserva.id}`} className="text-sm text-carbon/75">
            <span className="font-semibold text-carbon">
              {locale === "en" ? `Table ${number}` : `Mesa ${number}`} ·{" "}
              {reservationTime(reserva.scheduledAt)}
            </span>{" "}
            — {reserva.name}, {reserva.partySize}{" "}
            {locale === "en" ? "guests" : "personas"} (
            {timeUntilLabel(reserva.scheduledAt, locale === "en" ? "en" : "es", ahora)})
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-carbon/60">
        {locale === "en"
          ? "Seat them anyway if there's enough time, or cancel and pick another table."
          : "Sentalos igual si les da el tiempo, o cancelá y elegí otra mesa."}
      </p>
    </div>
  );
};

/* Hard block, unlike AvisoReserva which is only a heads-up. These tables have
 * a booking inside the floor hold window (before the time through grace), so
 * the panel won't seat a walk-in on them. Says who is coming and until when. */
export const AvisoBloqueoReserva = ({
  mesas,
  porMesa,
  locale,
}: {
  mesas: number[];
  porMesa: Map<number, ReservationView>;
  locale: string;
}) => {
  if (!mesas.length) return null;
  const es = locale !== "en";
  return (
    <div className="mt-4 rounded-2xl border border-red-400/60 bg-red-50/80 px-3.5 py-3 dark:bg-red-500/10">
      <p className="text-sm font-semibold text-red-900 dark:text-red-200">
        {mesas.length === 1
          ? es
            ? "Esta mesa está reservada ahora"
            : "This table is booked right now"
          : es
            ? "Estas mesas están reservadas ahora"
            : "These tables are booked right now"}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {mesas.map((n) => {
          const r = porMesa.get(n);
          if (!r) return null;
          const hasta = new Date(
            new Date(r.scheduledAt).getTime() + r.graceMinutes * 60_000,
          );
          return (
            <li key={n} className="text-sm text-carbon/75">
              <span className="font-semibold text-carbon">
                {es ? `Mesa ${n}` : `Table ${n}`} ·{" "}
                {reservationTime(r.scheduledAt)}
              </span>{" "}
              — {r.name}
              {es
                ? `, tolerancia hasta las ${reservationTime(hasta.toISOString())}`
                : `, held until ${reservationTime(hasta.toISOString())}`}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-sm text-carbon/60">
        {es
          ? "Elegí otra mesa. Cuando venza la tolerancia esta se libera sola."
          : "Pick another table. This one frees up on its own once the grace period ends."}
      </p>
    </div>
  );
};
