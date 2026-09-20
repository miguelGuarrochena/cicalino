/* Los días que el local no abre.
 *
 * Se marcan una sola vez en Configuración y valen para todo el panel:
 * reservas, pedidos, pagos y la plantilla de mozos. Antes vivían adentro del
 * módulo de espera —eran "los días que no aparecen en el calendario de
 * reservas"— y el resto de la app los ignoraba: la plantilla de turnos ofrecía
 * el lunes cerrado como cualquier otro.
 *
 * Hay dos numeraciones dando vueltas y por eso este archivo existe. La config
 * guarda el día como lo devuelve `Date.getDay()` (0 = domingo … 6 = sábado), y
 * la plantilla de turnos usa la de la base, que es ISO (1 = lunes … 7 =
 * domingo). Convertir a mano en cada pantalla es justo el tipo de cuenta que
 * sale bien seis veces y mal la séptima. */

export type ClosedDays = readonly number[];

export const DAYS_IN_WEEK = 7;

/** ISO (1 = lunes … 7 = domingo) → `Date.getDay()` (0 = domingo). */
export const isoToWeekday = (iso: number): number => iso % DAYS_IN_WEEK;

/** `Date.getDay()` (0 = domingo) → ISO (7 = domingo). */
export const weekdayToIso = (weekday: number): number =>
  weekday === 0 ? DAYS_IN_WEEK : weekday;

export const isClosedWeekday = (
  weekday: number,
  closed?: ClosedDays,
): boolean => Boolean(closed?.includes(weekday));

export const isClosedIsoWeekday = (
  iso: number,
  closed?: ClosedDays,
): boolean => isClosedWeekday(isoToWeekday(iso), closed);

/* Un local con los siete días cerrados no existe: el formulario no lo deja
 * guardar. Pero si llegara uno igual —una fila vieja, una importación— más
 * vale tratarlo como abierto que colgar los bucles que buscan el próximo día
 * hábil. */
export const everyDayClosed = (closed?: ClosedDays): boolean =>
  new Set(closed ?? []).size >= DAYS_IN_WEEK;

/* El día hábil anterior o siguiente, en ISO. `delta` es de a un día. */
export const shiftToOpenIsoWeekday = (
  iso: number,
  delta: 1 | -1,
  closed?: ClosedDays,
): number => {
  if (everyDayClosed(closed)) return iso;
  let d = iso;
  for (let i = 0; i < DAYS_IN_WEEK; i++) {
    d = ((d - 1 + delta + DAYS_IN_WEEK) % DAYS_IN_WEEK) + 1;
    if (!isClosedIsoWeekday(d, closed)) return d;
  }
  return iso;
};

/* Cuántos días de calendario hay que mirar para juntar `count` días abiertos,
 * empezando por `weekday` (0 = domingo) inclusive.
 *
 * Lo usa la ventana de reservas: el picker ofrece siete días abiertos, que con
 * dos francos por semana caen bastante más adelante que siete días de
 * almanaque. */
export const calendarDaysForOpenDays = (
  count: number,
  weekday: number,
  closed?: ClosedDays,
): number => {
  if (count <= 0) return 0;
  if (everyDayClosed(closed)) return count;
  let abiertos = 0;
  let dias = 0;
  const tope = count * DAYS_IN_WEEK;
  while (abiertos < count && dias < tope) {
    if (!isClosedWeekday((weekday + dias) % DAYS_IN_WEEK, closed)) abiertos++;
    dias++;
  }
  return dias;
};
