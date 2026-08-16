/* La jornada del local, anclada a una zona horaria fija.
 *
 * Antes esto usaba `new Date().getHours()`, o sea la hora local del
 * dispositivo. Dos tablets del mismo mostrador con la zona configurada
 * distinta veían jornadas distintas, y una con la zona mal puesta veía la
 * lista de otro día.
 *
 * La zona va fija porque el producto es de Argentina. Si algún día hay
 * clientes en otro huso, esto pasa a ser una columna de `locales` y la función
 * recibe la zona por parámetro — la firma ya está preparada para eso.
 */

export const DEFAULT_CUTOFF_HOUR = 6;

export const TZ_NEGOCIO = "America/Argentina/Buenos_Aires";

interface Partes {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/* Qué hora es, en la zona del negocio, para un instante dado. */
const partesEnZona = (d: Date, tz: string): Partes => {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    /* h23 y no `hour12: false`: con hour12 el ciclo queda a criterio del ICU y
     * algunos devuelven "24" para la medianoche. El `% 24` de abajo ya lo
     * cubría, pero es mejor pedir el formato que queremos que corregirlo
     * después. */
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(d)) p[type] = value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    /* Algunas versiones de ICU devuelven "24" para la medianoche. */
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
  };
};

/* Cuánto se corre la zona respecto de UTC en ese instante. */
const offsetMs = (d: Date, tz: string): number => {
  const p = partesEnZona(d, tz);
  const comoSiFueraUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return comoSiFueraUtc - d.getTime();
};

/* El instante UTC en que el reloj de pared de `tz` marca esa fecha y hora.
 *
 * Va en dos pasadas porque el offset depende del instante que estamos
 * buscando: la primera da una aproximación y la segunda la corrige. Argentina
 * hoy no cambia de hora, así que la primera ya alcanza; las dos pasadas son
 * para que siga andando si alguna vez vuelve el horario de verano. */
const instanteEnZona = (
  year: number,
  month: number,
  day: number,
  hour: number,
  tz: string,
  minute = 0,
): Date => {
  const pared = Date.UTC(year, month - 1, day, hour, minute);
  let ms = pared;
  for (let i = 0; i < 2; i++) ms = pared - offsetMs(new Date(ms), tz);
  return new Date(ms);
};

/* Qué día es, en la zona del negocio. Formato "YYYY-MM-DD".
 *
 * Ojo con el nombre: esto es el día del CALENDARIO, no la jornada. La jornada
 * (con `hora_corte`) es `businessDayStart`. El picker de reservas quiere el
 * calendario: una reserva es "el martes a las 21", no "la jornada del martes". */
export const dateKeyInTz = (
  ahora: Date = new Date(),
  tz: string = TZ_NEGOCIO,
): string => {
  const p = partesEnZona(ahora, tz);
  const dosDigitos = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${dosDigitos(p.month)}-${dosDigitos(p.day)}`;
};

/* Minutos transcurridos desde la medianoche, en la zona del negocio. */
export const minutesOfDayInTz = (
  ahora: Date = new Date(),
  tz: string = TZ_NEGOCIO,
): number => {
  const p = partesEnZona(ahora, tz);
  return p.hour * 60 + p.minute;
};

/* El instante en que el reloj de pared del negocio marca ese día y esa hora.
 *
 * Es lo que faltaba para las reservas. El picker produce "2026-08-09T21:00",
 * un string sin offset, y `new Date(...)` lo interpreta como hora local DEL
 * DISPOSITIVO. La agenda, en cambio, siempre mostró en hora argentina. Con una
 * tablet mal configurada la reserva se guardaba en un instante y aparecía en
 * otra fila —o directamente en otro día— sin que nadie entendiera por qué.
 *
 * Devuelve null si las claves no tienen el formato esperado, para que el
 * llamador pueda avisar en vez de guardar un Invalid Date. */
export const instantFromBusinessWallClock = (
  dateKey: string,
  timeKey: string,
  tz: string = TZ_NEGOCIO,
): Date | null => {
  const fecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  const hora = /^(\d{2}):(\d{2})$/.exec(timeKey);
  if (!fecha || !hora) return null;

  const year = Number(fecha[1]);
  const month = Number(fecha[2]);
  const day = Number(fecha[3]);
  const h = Number(hora[1]);
  const m = Number(hora[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (h > 23 || m > 59) return null;

  return instanteEnZona(year, month, day, h, tz, m);
};

/* Arranque de la jornada: hoy a la hora de corte, o ayer si todavía no
 * llegamos a esa hora. Con corte a las 6, a las 3 de la mañana seguís
 * trabajando en la jornada de ayer. */
export const businessDayStart = (
  hora: number = DEFAULT_CUTOFF_HOUR,
  ahora: Date = new Date(),
  tz: string = TZ_NEGOCIO,
): Date => {
  const p = partesEnZona(ahora, tz);
  let { year, month, day } = p;
  if (p.hour < hora) {
    const ayer = new Date(Date.UTC(year, month - 1, day) - 86_400_000);
    year = ayer.getUTCFullYear();
    month = ayer.getUTCMonth() + 1;
    day = ayer.getUTCDate();
  }
  return instanteEnZona(year, month, day, hora, tz);
};

/* Cierre: la misma hora de corte del día siguiente.
 *
 * Se recalcula desde las partes en vez de sumar 24 horas, para que un cambio
 * de horario de verano no lo corra una hora. */
export const businessDayEnd = (
  hora: number = DEFAULT_CUTOFF_HOUR,
  ahora: Date = new Date(),
  tz: string = TZ_NEGOCIO,
): Date => {
  const inicio = businessDayStart(hora, ahora, tz);
  const p = partesEnZona(inicio, tz);
  const manana = new Date(
    Date.UTC(p.year, p.month - 1, p.day) + 86_400_000,
  );
  return instanteEnZona(
    manana.getUTCFullYear(),
    manana.getUTCMonth() + 1,
    manana.getUTCDate(),
    hora,
    tz,
  );
};

/* Cuántos días calendario ofrece el picker de reservas en espera.
 * Tiene que coincidir con `buildDayOptions` en `lib/espera/slots.ts`. */
export const RESERVATION_PICKER_DAYS = 7;

/* Ventana de reservas que el panel tiene que bajar para que el mapa y el
 * choque del picker coincidan con lo que `crear_reserva` mira en la base.
 *
 * La jornada sola no alcanza: el picker deja reservar hasta 7 días, y antes
 * del corte una reserva de "hoy" a la mañana cae justo después del cierre de
 * la jornada anterior. El panel no la veía, el servidor sí, y respondía
 * `choque` contra una reserva invisible. */
export const reservationFetchRange = (
  hora: number = DEFAULT_CUTOFF_HOUR,
  ahora: Date = new Date(),
  tz: string = TZ_NEGOCIO,
): { start: Date; end: Date } => {
  const start = businessDayStart(hora, ahora, tz);
  const end = businessDayEnd(
    hora,
    new Date(start.getTime() + RESERVATION_PICKER_DAYS * 86_400_000),
    tz,
  );
  return { start, end };
};
