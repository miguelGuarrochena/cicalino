/* Extraído de app/(app)/panel/espera/page.tsx. Movido tal cual. */

import type {
  SeatWalkInReason,
  NewReservationReason,
} from "@/lib/data/waitlist";

/* Why the seat attempt was rejected. It used to be one generic "table taken?"
 * for every failure, which was wrong half the time: the usual case now is a
 * table held by a booking that is still inside its grace period. */
export const motivoOcupar = (reason: SeatWalkInReason, locale: string): string => {
  const es = locale !== "en";
  if (reason === "suscripcion-vencida") {
    return es
      ? "La cuenta está dada de baja. Escribinos para reactivarla."
      : "The account is suspended. Get in touch to reactivate it.";
  }
  if (reason === "mesa-reservada") {
    return es
      ? "Esa mesa tiene una reserva en curso. Esperá a que venza la tolerancia o elegí otra."
      : "That table has a booking in progress. Wait for the grace period to end or pick another.";
  }
  if (reason === "mesa-no-disponible") {
    return es
      ? "Alguien ocupó esa mesa recién. Recargá y elegí otra."
      : "Someone just took that table. Reload and pick another.";
  }
  if (reason === "sin-mesas") {
    return es ? "Elegí al menos una mesa." : "Pick at least one table.";
  }
  return es
    ? "No se pudo ocupar. Revisá la conexión y probá de nuevo."
    : "Couldn’t seat. Check the connection and try again.";
};

/* Why the booking was rejected. It used to be one generic "table not
 * available" for all five failure modes, including the one that matters most:
 * another booking already sitting too close in time on the same table. */
export const motivoReserva = (
  reason: NewReservationReason,
  locale: string,
): string => {
  const es = locale !== "en";
  if (reason === "suscripcion-vencida") {
    return es
      ? "La cuenta está dada de baja. Escribinos para reactivarla."
      : "The account is suspended. Get in touch to reactivate it.";
  }
  if (reason === "choque") {
    return es
      ? "Esa mesa ya tiene una reserva muy cerca de ese horario. Elegí otra mesa u otro horario."
      : "That table already has a booking too close to that time. Pick another table or time.";
  }
  if (reason === "capacidad-insuficiente") {
    return es
      ? "Las mesas elegidas no alcanzan para esa cantidad de personas."
      : "The selected tables don't fit that party size.";
  }
  if (reason === "mesa-inexistente") {
    return es
      ? "Alguna de esas mesas ya no existe. Recargá y probá de nuevo."
      : "One of those tables no longer exists. Reload and try again.";
  }
  if (reason === "sin-mesas") {
    return es ? "Elegí al menos una mesa." : "Pick at least one table.";
  }
  if (reason === "sin-horario") {
    return es ? "Elegí un horario válido." : "Pick a valid time.";
  }
  return es
    ? "No se pudo reservar. Revisá la conexión y probá de nuevo."
    : "Couldn't book. Check the connection and try again.";
};
