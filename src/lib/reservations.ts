import type { ReservationView } from "@/lib/types";

export const SOON_THRESHOLD_MIN = 60;

export const MIN_GAP_BETWEEN_RESERVATIONS = 90;

export const minutesUntil = (iso: string, now = Date.now()): number =>
  Math.round((new Date(iso).getTime() - now) / 60_000);

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

export const reservationTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], {
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
