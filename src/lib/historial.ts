import {
  businessDayEnd,
  businessDayStart,
  dateKeyInTz,
  instantFromBusinessWallClock,
} from "@/lib/businessDay";

/* Los períodos que el historial ofrece, en horas de jornada y no de reloj.
 *
 * Un restaurante que cierra a las 3 de la mañana tiene un "hoy" que no termina
 * a medianoche: la mesa de las 01:30 es del servicio de anoche. Por eso los
 * rangos se arman con la hora de corte del local, igual que el resto del
 * panel, y no con `new Date().setHours(0,0,0,0)`.
 *
 * El rango va cerrado abajo y abierto arriba —[desde, hasta)— para que una
 * mesa cerrada exactamente en el corte caiga en un solo período y no en dos. */
export type RangoPreset = "hoy" | "ayer" | "7d" | "mes" | "personalizado";

export interface Rango {
  desde: string;
  hasta: string;
}

const DIA_MS = 24 * 60 * 60 * 1000;
const MEDIO_DIA_MS = DIA_MS / 2;

/* Un instante cómodamente adentro de la jornada que arrancó n días antes.
 *
 * Restar días justos del corte deja el resultado pegado al borde, y con un
 * cambio de horario de verano cae una hora antes: `businessDayStart` lo leería
 * como la jornada anterior y el período saldría con un día de más. Doce horas
 * después del corte está lejos de los dos bordes, así que la cuenta no se
 * corre por una hora de acá para allá. */
const jornadaHaceNDias = (inicioHoy: Date, n: number, corte: number): Date =>
  businessDayStart(corte, new Date(inicioHoy.getTime() - n * DIA_MS + MEDIO_DIA_MS));

/* El mediodía del negocio de una fecha del selector, para anclar el cálculo de
 * la jornada sin depender de la zona horaria del dispositivo. */
const mediodiaDe = (dia: string): Date | null =>
  instantFromBusinessWallClock(dia, "12:00");

export const rangoDe = (
  preset: RangoPreset,
  cutoffHour: number,
  opts: { desde?: string; hasta?: string; ahora?: Date } = {},
): Rango => {
  const ahora = opts.ahora ?? new Date();
  const inicioHoy = businessDayStart(cutoffHour, ahora);
  const finHoy = businessDayEnd(cutoffHour, ahora);

  if (preset === "ayer") {
    return {
      desde: jornadaHaceNDias(inicioHoy, 1, cutoffHour).toISOString(),
      hasta: inicioHoy.toISOString(),
    };
  }
  if (preset === "7d") {
    /* Siete jornadas contando la de hoy, no siete por delante del corte. */
    return {
      desde: jornadaHaceNDias(inicioHoy, 6, cutoffHour).toISOString(),
      hasta: finHoy.toISOString(),
    };
  }
  if (preset === "mes") {
    /* El primero del mes en el calendario del negocio: la jornada de hoy ya
     * está anclada a esa zona, así que de ahí sale el mes correcto también
     * cuando son las 2 de la mañana del día 1. */
    const uno = mediodiaDe(`${dateKeyInTz(inicioHoy).slice(0, 8)}01`);
    return {
      desde: (uno ? businessDayStart(cutoffHour, uno) : inicioHoy).toISOString(),
      hasta: finHoy.toISOString(),
    };
  }
  if (preset === "personalizado" && opts.desde) {
    /* Las fechas del selector son días de calendario y acá se leen como
     * jornadas: el "hasta" incluye entera la jornada del día elegido. */
    const d = mediodiaDe(opts.desde);
    const h = mediodiaDe(opts.hasta || opts.desde) ?? d;
    if (d && h) {
      return {
        desde: businessDayStart(cutoffHour, d).toISOString(),
        hasta: businessDayEnd(cutoffHour, h).toISOString(),
      };
    }
  }
  return { desde: inicioHoy.toISOString(), hasta: finHoy.toISOString() };
};

/* Lo que la lista del historial muestra por fila. No trae el detalle: eso se
 * pide aparte y solo cuando alguien abre una mesa. */
export type CierreEstado = "pagada" | "sin-cobrar";

export interface CierreRow {
  id: string;
  tableNumber: number;
  at: string;
  estado: CierreEstado;
  consumo: number;
  cobrado: number;
  motivo: string | null;
  metodos: string[];
  comensales: string[];
}

export const PAGINA_HISTORIAL = 20;
