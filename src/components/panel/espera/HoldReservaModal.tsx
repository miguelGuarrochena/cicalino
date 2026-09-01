"use client";

/* Extraído de app/(app)/panel/espera/page.tsx. Movido tal cual.
 *
 * La mesa está tomada por una reserva que todavía no llegó. Desde acá se la
 * sienta, se la cancela, o se cierra y se espera a que venza la tolerancia.
 *
 * Sentar y cancelar los resuelve el padre: acá solo se avisa que se tocó el
 * botón. */

import { ModalShell } from "@/components/ui/ModalShell";
import { reservationTime, timeUntilLabel } from "@/lib/reservations";
import { tablesTitle, type ReservationView } from "@/lib/types";

export const HoldReservaModal = ({
  reserva,
  ahora,
  locale,
  btnClass,
  onSentar,
  onCancelar,
  onClose,
}: {
  reserva: ReservationView;
  ahora: number;
  locale: string;
  /* Las clases de los botones las define la página: son las mismas que usa el
   * resto de la pantalla y no tiene sentido duplicar la cadena acá. */
  btnClass: string;
  onSentar: () => void;
  onCancelar: () => void;
  onClose: () => void;
}) => {
  const es = locale !== "en";
  const lang = es ? "es" : "en";
  const mesas = tablesTitle(
    reserva.tableNumbers ?? [reserva.tableNumber],
    lang,
  );

  return (
    <ModalShell onClose={onClose} labelledBy="hold-reserva-title">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-curso/80">
        {es ? "Reservada ahora" : "Reserved now"}
      </p>
      <h2
        id="hold-reserva-title"
        className="mt-1 font-display text-2xl uppercase tracking-tight text-carbon"
      >
        {reserva.name}
      </h2>
      <p className="mt-2 text-sm text-carbon/60">
        {mesas} · {reserva.partySize} {es ? "personas" : "guests"} ·{" "}
        {reservationTime(reserva.scheduledAt)} · +{reserva.graceMinutes} min ·{" "}
        {timeUntilLabel(reserva.scheduledAt, lang, ahora)}
      </p>
      <p className="mt-3 rounded-2xl border border-amber-400/50 bg-amber-50/80 px-3.5 py-3 text-sm text-amber-950 dark:bg-amber-400/10 dark:text-amber-100">
        {es
          ? "No se puede sentar walk-in mientras esté en hold. Sentá la reserva, cancelala, o esperá que venza la tolerancia."
          : "Walk-ins can’t take this table while the hold is on. Seat the booking, cancel it, or wait for grace to end."}
      </p>
      <p className="mt-2 text-xs text-carbon/45">
        {es
          ? "Para cambiar horario o mesa: cancelá y creá otra reserva."
          : "To change time or table: cancel and create a new booking."}
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={onSentar}
          className={`${btnClass} bg-carbon text-crema hover:opacity-90 sm:flex-1`}
        >
          {es ? "Sentar reserva" : "Seat booking"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className={`${btnClass} text-alerta hover:bg-alerta-fondo sm:flex-1`}
        >
          {es ? "Cancelar reserva" : "Cancel booking"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className={`${btnClass} border border-linea text-carbon/70 hover:bg-crema sm:w-full`}
        >
          {es ? "Cerrar" : "Close"}
        </button>
      </div>
    </ModalShell>
  );
};
