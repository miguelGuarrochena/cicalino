/* Fechas y franjas horarias del módulo de espera.
 *
 * Estaba todo suelto arriba de la página, que tenía 2531 líneas. Acá es puro
 * y testeable, que es lo que más falta le hacía: son cuentas de fechas que se
 * rompen sin avisar y nadie mira hasta que alguien reserva mal.
 *
 * Movido tal cual: sin cambios de comportamiento. */

export const minsAgo = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));

export const pad2 = (n: number) => String(n).padStart(2, "0");

export const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

export const SLOT_STEP_MIN = 15;
export const SLOT_START_MIN = 11 * 60;
export const SLOT_END_MIN = 23 * 60 + 45;

export const snapToSlot = (d: Date) => {
  const out = new Date(d);
  out.setSeconds(0, 0);
  const total = out.getHours() * 60 + out.getMinutes();
  const snapped = Math.ceil(total / SLOT_STEP_MIN) * SLOT_STEP_MIN;
  out.setHours(Math.floor(snapped / 60), snapped % 60, 0, 0);
  return out;
};

export const defaultHorarioInput = () => {
  const d = snapToSlot(new Date(Date.now() + 60 * 60_000));
  return toLocalInput(d);
};

export const dateKeyFromLocal = (local: string) => local.slice(0, 10);
export const timeKeyFromLocal = (local: string) => local.slice(11, 16);

export const combineLocalHorario = (dateKey: string, timeKey: string) =>
  `${dateKey}T${timeKey}`;

export const todayDateKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export const addDaysKey = (dateKey: string, days: number) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
};

export const buildDayOptions = (locale: string) => {
  const today = todayDateKey();
  const loc = locale === "en" ? "en-US" : "es-AR";
  return Array.from({ length: 7 }, (_, i) => {
    const key = addDaysKey(today, i);
    const [y, m, d] = key.split("-").map(Number);
    const label =
      i === 0
        ? locale === "en"
          ? "Today"
          : "Hoy"
        : i === 1
          ? locale === "en"
            ? "Tomorrow"
            : "Mañana"
          : new Date(y, m - 1, d).toLocaleDateString(loc, {
              weekday: "short",
              day: "numeric",
            });
    return { key, label };
  });
};

export const allTimeSlots = (() => {
  const slots: string[] = [];
  for (let m = SLOT_START_MIN; m <= SLOT_END_MIN; m += SLOT_STEP_MIN) {
    slots.push(`${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`);
  }
  return slots;
})();

export const availableTimeSlots = (dateKey: string) => {
  if (dateKey !== todayDateKey()) return allTimeSlots;
  const ahora = new Date();
  const proxima = snapToSlot(ahora);

  /* snapToSlot redondea hacia arriba, así que después de las 23:45 cruza a
   * mañana y la hora queda en 00:00. Sin esta guarda, `minKey` pasaba a ser
   * "00:00" y el filtro dejaba pasar todas las franjas del día — incluidas
   * las de las 11 de la mañana, ya vencidas. Si el redondeo cambió de día,
   * hoy no queda ninguna. */
  if (proxima.getDate() !== ahora.getDate()) return [];

  const minKey = `${pad2(proxima.getHours())}:${pad2(proxima.getMinutes())}`;
  return allTimeSlots.filter((t) => t >= minKey);
};

export const formatHora = (iso: string, locale: string) =>
  new Date(iso).toLocaleString(locale === "en" ? "en-US" : "es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });
