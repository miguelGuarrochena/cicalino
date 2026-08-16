/* Fechas y franjas horarias del módulo de espera.
 *
 * Estaba todo suelto arriba de la página, que tenía 2531 líneas. Acá es puro
 * y testeable, que es lo que más falta le hacía: son cuentas de fechas que se
 * rompen sin avisar y nadie mira hasta que alguien reserva mal.
 *
 * La ventana (abre/cierra) y los días cerrados salen de la config del local.
 * Los defaults coinciden con el producto histórico: 11:00–23:00, sin cierres.
 *
 * "Hoy" y "ahora" salen de la zona del negocio, no del reloj del dispositivo.
 * Antes eran `new Date().getHours()`: una tablet con la zona mal puesta
 * ofrecía franjas de otro momento del día, y la agenda —que siempre mostró en
 * hora argentina— ubicaba la reserva en otra fila. Es el mismo criterio que
 * `businessDay.ts`, que se reescribió por exactamente este motivo. */

import { dateKeyInTz, minutesOfDayInTz, TZ_NEGOCIO } from "@/lib/businessDay";

export const minsAgo = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));

export const pad2 = (n: number) => String(n).padStart(2, "0");

export const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

export const SLOT_STEP_MIN = 15;
export const SLOT_START_MIN = 11 * 60;
export const SLOT_END_MIN = 23 * 60;

export type ReservationHours = {
  startMin?: number;
  endMin?: number;
  /** 0 = Sunday … 6 = Saturday (`Date.getDay()`). */
  closedWeekdays?: number[];
};

const clampWindow = (startMin: number, endMin: number) => {
  const start = Math.max(0, Math.min(1439, startMin));
  let end = Math.max(0, Math.min(1439, endMin));
  if (end <= start) end = Math.min(1439, start + SLOT_STEP_MIN);
  return { start, end };
};

export const minToTimeKey = (mins: number) =>
  `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;

export const timeKeyToMin = (timeKey: string) => {
  const [h, m] = timeKey.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
};

export const buildTimeSlots = (
  startMin = SLOT_START_MIN,
  endMin = SLOT_END_MIN,
): string[] => {
  const { start, end } = clampWindow(startMin, endMin);
  const slots: string[] = [];
  for (let m = start; m <= end; m += SLOT_STEP_MIN) {
    slots.push(minToTimeKey(m));
  }
  return slots;
};

/** Default product window — kept for tests / callers without config. */
export const allTimeSlots = buildTimeSlots();

/* Redondea hacia arriba al bloque de 15. Trabaja en minutos desde medianoche
 * en vez de sobre un Date, porque el minuto ya viene medido en la zona del
 * negocio y volver a pasarlo por un Date reintroduciría la zona local. */
export const snapMinutesToSlot = (mins: number) =>
  Math.ceil(mins / SLOT_STEP_MIN) * SLOT_STEP_MIN;

export const defaultHorarioInput = (hours?: ReservationHours) => {
  const days = buildDayOptions("es", hours);
  const firstDay = days[0]?.key ?? todayDateKey();
  const slots = availableTimeSlots(firstDay, hours);
  const t =
    slots[0] ??
    minToTimeKey(hours?.startMin ?? SLOT_START_MIN);
  return combineLocalHorario(firstDay, t);
};

export const dateKeyFromLocal = (local: string) => local.slice(0, 10);
export const timeKeyFromLocal = (local: string) => local.slice(11, 16);

export const combineLocalHorario = (dateKey: string, timeKey: string) =>
  `${dateKey}T${timeKey}`;

export const todayDateKey = () => dateKeyInTz();

export const addDaysKey = (dateKey: string, days: number) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
};

export const weekdayOfKey = (dateKey: string) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
};

export const buildDayOptions = (
  locale: string,
  hours?: ReservationHours,
  count = 7,
) => {
  const today = todayDateKey();
  const tomorrow = addDaysKey(today, 1);
  const closed = new Set(hours?.closedWeekdays ?? []);
  const loc = locale === "en" ? "en-US" : "es-AR";
  const out: { key: string; label: string }[] = [];
  /* Look ahead enough calendar days to fill `count` open days (all closed
   * weekdays still shouldn't hang forever). */
  for (let i = 0; out.length < count && i < 28; i++) {
    const key = addDaysKey(today, i);
    if (closed.has(weekdayOfKey(key))) continue;
    const [y, m, d] = key.split("-").map(Number);
    const label =
      key === today
        ? locale === "en"
          ? "Today"
          : "Hoy"
        : key === tomorrow
          ? locale === "en"
            ? "Tomorrow"
            : "Mañana"
          : new Date(y, m - 1, d).toLocaleDateString(loc, {
              weekday: "short",
              day: "numeric",
            });
    out.push({ key, label });
  }
  return out;
};

export const availableTimeSlots = (
  dateKey: string,
  hours?: ReservationHours,
) => {
  const slots = buildTimeSlots(
    hours?.startMin ?? SLOT_START_MIN,
    hours?.endMin ?? SLOT_END_MIN,
  );
  if (dateKey !== todayDateKey()) return slots;
  const proxima = snapMinutesToSlot(minutesOfDayInTz());

  /* Redondea hacia arriba, así que después del último bloque del día cruza a
   * mañana. Sin esta guarda, `minKey` pasaba a ser "00:00" y el filtro dejaba
   * pasar franjas ya vencidas. */
  if (proxima > 1439) return [];

  const minKey = minToTimeKey(proxima);
  return slots.filter((t) => t >= minKey);
};

/* Mismo criterio que `reservationTime`: se guarda en hora del negocio, se
 * muestra en hora del negocio. Sin `timeZone` salía en hora del dispositivo. */
export const formatHora = (iso: string, locale: string) =>
  new Date(iso).toLocaleString(locale === "en" ? "en-US" : "es-AR", {
    timeZone: TZ_NEGOCIO,
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });
