import type { ReservationView } from "@/lib/types";
import { TZ_NEGOCIO } from "@/lib/businessDay";

/* Cuánto antes del horario la mesa se pinta entera de ámbar en el mapa y el
 * panel deja de ofrecerla para walk-in. La base sigue bloqueando solo dentro
 * de la gracia (`isWithinGrace`); esto es la señal de piso para el staff. */
export const HOLD_BEFORE_MIN = 30;

export const SOON_THRESHOLD_MIN = HOLD_BEFORE_MIN;

export const MIN_GAP_BETWEEN_RESERVATIONS = 90;

/* If a table is busy right now, don't take a booking that starts sooner than
 * this. Same order of magnitude as the gap between two bookings — enough for
 * a typical turn before the reserved party arrives. */
export const OCCUPIED_BOOKING_LEAD_MIN = MIN_GAP_BETWEEN_RESERVATIONS;

export const minutesUntil = (iso: string, now = Date.now()): number =>
  Math.round((new Date(iso).getTime() - now) / 60_000);

/* Busy table + booking too soon → block. Far-future booking on a busy table
 * is fine (lunch seated, dinner reserved). */
export const occupiedBlocksSoonBooking = (
  scheduledAt: string,
  tableStatus: "libre" | "ocupada",
  now = Date.now(),
): boolean => {
  if (tableStatus !== "ocupada") return false;
  const t = new Date(scheduledAt).getTime();
  if (Number.isNaN(t)) return false;
  return t < now + OCCUPIED_BOOKING_LEAD_MIN * 60_000;
};

export const earliestBookingAfterOccupied = (now = Date.now()): Date =>
  new Date(now + OCCUPIED_BOOKING_LEAD_MIN * 60_000);

export const reservationTables = (r: ReservationView): number[] => {
  const nums = r.tableNumbers?.length ? r.tableNumbers : [r.tableNumber];
  return [...new Set(nums)].filter((n) => n >= 1).sort((a, b) => a - b);
};

export const nextReservationByTable = (
  reservas: ReservationView[],
  now = Date.now(),
): Map<number, ReservationView> => {
  const out = new Map<number, ReservationView>();
  const vigentes = reservas
    .filter((r) => r.status === "activa")
    .filter(
      (r) =>
        new Date(r.scheduledAt).getTime() + r.graceMinutes * 60_000 >= now,
    )
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  for (const r of vigentes) {
    for (const n of reservationTables(r)) {
      if (!out.has(n)) out.set(n, r);
    }
  }
  return out;
};

export const isReservationSoon = (r: ReservationView, now = Date.now()): boolean =>
  minutesUntil(r.scheduledAt, now) <= SOON_THRESHOLD_MIN;

/* From HOLD_BEFORE before the booking until the grace ends: the floor treats
 * the table as reserved. Wider than `isWithinGrace` on purpose — staff need to
 * see it coming, not only once the clock hits. */
export const isReservationHolding = (
  r: ReservationView,
  now = Date.now(),
): boolean => {
  if (r.status !== "activa") return false;
  const start = new Date(r.scheduledAt).getTime();
  if (Number.isNaN(start)) return false;
  return (
    now >= start - HOLD_BEFORE_MIN * 60_000 &&
    now <= start + r.graceMinutes * 60_000
  );
};

/* Is the booking inside its grace period right now?
 *
 * From the booking time until booking time + grace, the table belongs to
 * whoever booked it and can't be given to a walk-in. Once that window closes
 * the cron expires the booking and the table frees up; a guest arriving after
 * that gets seated as a new walk-in.
 *
 * Mirrors `mesa_en_ventana_de_reserva` in supabase/sentar-walkin.sql. The one
 * that actually enforces this is the database — this one only drives the UI,
 * so a stale screen can't offer a table the server is going to reject. */
export const isWithinGrace = (
  r: ReservationView,
  now = Date.now(),
): boolean => {
  if (r.status !== "activa") return false;
  const start = new Date(r.scheduledAt).getTime();
  if (Number.isNaN(start)) return false;
  return now >= start && now <= start + r.graceMinutes * 60_000;
};

/* Tables currently held by a booking inside its grace period.
 *
 * Sorted by time so that when two bookings overlap on the same table we report
 * the earlier one, same as the `order by horario limit 1` in the SQL. Either
 * one blocks the table, but they have to agree on which one they name or the
 * panel says something different from the server. */
export const tablesHeldByReservation = (
  reservas: ReservationView[],
  now = Date.now(),
): Map<number, ReservationView> => {
  const out = new Map<number, ReservationView>();
  const enVentana = reservas
    .filter((r) => isWithinGrace(r, now))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  for (const r of enVentana) {
    for (const n of reservationTables(r)) {
      if (!out.has(n)) out.set(n, r);
    }
  }
  return out;
};

/* Same shape as `tablesHeldByReservation`, but with the wider floor window
 * (HOLD_BEFORE → grace). Used by the map and the walk-in picker so a table
 * lights up amber before the server hard-blocks it. */
export const tablesInFloorHold = (
  reservas: ReservationView[],
  now = Date.now(),
): Map<number, ReservationView> => {
  const out = new Map<number, ReservationView>();
  const enHold = reservas
    .filter((r) => isReservationHolding(r, now))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  for (const r of enHold) {
    for (const n of reservationTables(r)) {
      if (!out.has(n)) out.set(n, r);
    }
  }
  return out;
};

export const conflictingReservation = (
  tableNumbers: number[],
  horarioIso: string,
  reservas: ReservationView[],
  ignorarId?: string,
): ReservationView | null => {
  const nums = new Set(tableNumbers);
  const t = new Date(horarioIso).getTime();
  if (Number.isNaN(t)) return null;
  for (const r of reservas) {
    if (r.id === ignorarId) continue;
    if (r.status !== "activa") continue;
    if (!reservationTables(r).some((n) => nums.has(n))) continue;
    const diff = Math.abs(new Date(r.scheduledAt).getTime() - t) / 60_000;
    if (diff < MIN_GAP_BETWEEN_RESERVATIONS) return r;
  }
  return null;
};

/* La hora de la reserva, en la zona del negocio.
 *
 * Sin `timeZone` esto salía en hora del dispositivo, mientras que el agrupado
 * por día (`reservationDateKey`) siempre fue en hora argentina. En una tablet
 * con la zona mal puesta la misma reserva se leía a una hora y se listaba bajo
 * otro día. Se guarda en hora argentina (`instantFromBusinessWallClock`), así
 * que también se muestra en hora argentina. */
export const reservationTime = (
  iso: string,
  timeZone = TZ_NEGOCIO,
): string =>
  new Date(iso).toLocaleTimeString([], {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export const timeUntilLabel = (
  iso: string,
  locale: "es" | "en" = "es",
  now = Date.now(),
): string => {
  const mins = minutesUntil(iso, now);
  if (mins < -1) {
    const late = Math.abs(mins);
    return locale === "en" ? `${late} min late` : `hace ${late} min`;
  }
  if (mins <= 1) return locale === "en" ? "now" : "ahora";
  if (mins < 60) return locale === "en" ? `in ${mins} min` : `en ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const resto = m ? ` ${m}` : "";
  return locale === "en" ? `in ${h} h${resto}` : `en ${h} h${resto}`;
};

export const reservationDateKey = (
  iso: string,
  timeZone = TZ_NEGOCIO,
): string => {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(iso));
};
