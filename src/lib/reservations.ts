import type { ReservationView } from "@/lib/types";

export const SOON_THRESHOLD_MIN = 60;

export const MIN_GAP_BETWEEN_RESERVATIONS = 90;

export const minutesUntil = (iso: string, now = Date.now()): number =>
  Math.round((new Date(iso).getTime() - now) / 60_000);

export const reservationTables = (r: ReservationView): number[] => {
  const nums = r.mesasNumeros?.length ? r.mesasNumeros : [r.mesaNumero];
  return [...new Set(nums)].filter((n) => n >= 1).sort((a, b) => a - b);
};

export const nextReservationByTable = (
  reservas: ReservationView[],
  now = Date.now(),
): Map<number, ReservationView> => {
  const out = new Map<number, ReservationView>();
  const vigentes = reservas
    .filter((r) => r.estado === "activa")
    .filter(
      (r) =>
        new Date(r.horario).getTime() + r.graciaMinutos * 60_000 >= now,
    )
    .sort((a, b) => a.horario.localeCompare(b.horario));
  for (const r of vigentes) {
    for (const n of reservationTables(r)) {
      if (!out.has(n)) out.set(n, r);
    }
  }
  return out;
};

export const isReservationSoon = (r: ReservationView, now = Date.now()): boolean =>
  minutesUntil(r.horario, now) <= SOON_THRESHOLD_MIN;

export const conflictingReservation = (
  mesaNumeros: number[],
  horarioIso: string,
  reservas: ReservationView[],
  ignorarId?: string,
): ReservationView | null => {
  const nums = new Set(mesaNumeros);
  const t = new Date(horarioIso).getTime();
  if (Number.isNaN(t)) return null;
  for (const r of reservas) {
    if (r.id === ignorarId) continue;
    if (r.estado !== "activa") continue;
    if (!reservationTables(r).some((n) => nums.has(n))) continue;
    const diff = Math.abs(new Date(r.horario).getTime() - t) / 60_000;
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
