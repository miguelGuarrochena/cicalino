import type { ReservaView } from "@/lib/types";

/**
 * Reservas que avisan, no bloquean.
 *
 * La mesa nunca queda "reservada". Sigue libre hasta que alguien se sienta.
 * Lo único que hace la reserva es avisar:
 *   - en el mapa de mesas, con la hora
 *   - al sentar a alguien en esa mesa, con un cartel de confirmación
 */

/** Dentro de esta ventana el aviso pasa a ser urgente (ámbar). */
export const AVISO_PRONTO_MIN = 60;

/** Separación mínima entre dos reservas de la misma mesa (evita doble reserva). */
export const SEPARACION_RESERVAS_MIN = 90;

/** Minutos que faltan para el horario. Negativo si ya pasó. */
export const minutosHasta = (iso: string, now = Date.now()): number =>
  Math.round((new Date(iso).getTime() - now) / 60_000);

/** Mesas de la reserva (soporta filas viejas sin `mesasNumeros`). */
export const mesasDeReserva = (r: ReservaView): number[] => {
  const nums = r.mesasNumeros?.length ? r.mesasNumeros : [r.mesaNumero];
  return [...new Set(nums)].filter((n) => n >= 1).sort((a, b) => a - b);
};

/**
 * Reserva vigente más cercana de cada mesa.
 * Vigente = activa y todavía no vencida (horario + gracia).
 */
export const reservaProximaPorMesa = (
  reservas: ReservaView[],
  now = Date.now(),
): Map<number, ReservaView> => {
  const out = new Map<number, ReservaView>();
  const vigentes = reservas
    .filter((r) => r.estado === "activa")
    .filter(
      (r) =>
        new Date(r.horario).getTime() + r.graciaMinutos * 60_000 >= now,
    )
    .sort((a, b) => a.horario.localeCompare(b.horario));
  for (const r of vigentes) {
    for (const n of mesasDeReserva(r)) {
      if (!out.has(n)) out.set(n, r);
    }
  }
  return out;
};

/** ¿Falta poco para la reserva? (o ya está en su ventana de gracia) */
export const esReservaPronto = (r: ReservaView, now = Date.now()): boolean =>
  minutosHasta(r.horario, now) <= AVISO_PRONTO_MIN;

/**
 * Devuelve la reserva que choca con una nueva en esas mesas y ese horario,
 * o null si no hay conflicto. Dos reservas de la misma mesa necesitan al
 * menos `SEPARACION_RESERVAS_MIN` de diferencia.
 */
export const reservaEnConflicto = (
  mesaNumeros: number[],
  horarioIso: string,
  reservas: ReservaView[],
  ignorarId?: string,
): ReservaView | null => {
  const nums = new Set(mesaNumeros);
  const t = new Date(horarioIso).getTime();
  if (Number.isNaN(t)) return null;
  for (const r of reservas) {
    if (r.id === ignorarId) continue;
    if (r.estado !== "activa") continue;
    if (!mesasDeReserva(r).some((n) => nums.has(n))) continue;
    const diff = Math.abs(new Date(r.horario).getTime() - t) / 60_000;
    if (diff < SEPARACION_RESERVAS_MIN) return r;
  }
  return null;
};

/** "21:00" */
export const horaReserva = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/** "en 40 min" / "en 2 h 10" / "ahora" / "hace 5 min". */
export const faltaTexto = (
  iso: string,
  locale: "es" | "en" = "es",
  now = Date.now(),
): string => {
  const mins = minutosHasta(iso, now);
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
