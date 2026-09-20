import { describe, it, expect } from "vitest";
import {
  businessDayStart,
  businessDayEnd,
  reservationFetchRange,
  weekdayInTz,
  isJornadaActiva,
  TZ_NEGOCIO,
} from "@/lib/businessDay";
import {
  calendarDaysForOpenDays,
  isClosedIsoWeekday,
  isoToWeekday,
  shiftToOpenIsoWeekday,
  weekdayToIso,
} from "@/lib/closedDays";
import { rangoDe } from "@/lib/historial";

/* Los días cerrados se marcan una vez en Configuración y valen para todo el
 * panel. Lo que se prueba acá es la parte que no se ve: que un franco no
 * hereda la jornada anterior y que las dos numeraciones de día de la semana
 * —la de `Date.getDay()` y la ISO de la base— no se crucen. */

const LUNES_CERRADO = [1];

/* Qué hora de pared marca ese instante en la zona del negocio. */
const enBsAs = (d: Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_NEGOCIO,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(d)
    .replace(/, 24:/, ", 00:");

describe("numeración de los días", () => {
  it("el domingo es 0 para la config y 7 para la base", () => {
    expect(weekdayToIso(0)).toBe(7);
    expect(isoToWeekday(7)).toBe(0);
    expect(isoToWeekday(weekdayToIso(3))).toBe(3);
  });

  it("un lunes cerrado se reconoce con la numeración de la plantilla", () => {
    expect(isClosedIsoWeekday(1, LUNES_CERRADO)).toBe(true);
    expect(isClosedIsoWeekday(2, LUNES_CERRADO)).toBe(false);
    /* Domingo cerrado: 0 en la config, 7 en la plantilla. */
    expect(isClosedIsoWeekday(7, [0])).toBe(true);
  });

  it("navegar por la plantilla saltea los francos", () => {
    // Domingo (7) → siguiente abierto con el lunes cerrado es el martes.
    expect(shiftToOpenIsoWeekday(7, 1, LUNES_CERRADO)).toBe(2);
    expect(shiftToOpenIsoWeekday(2, -1, LUNES_CERRADO)).toBe(7);
  });

  it("con todo cerrado no se cuelga: devuelve el mismo día", () => {
    expect(shiftToOpenIsoWeekday(3, 1, [0, 1, 2, 3, 4, 5, 6])).toBe(3);
  });
});

describe("la jornada con días cerrados", () => {
  /* 2026-08-10 es lunes. */
  it("el lunes cerrado no hereda la jornada del domingo", () => {
    const lunesAlMediodia = new Date("2026-08-10T15:00:00Z");
    expect(weekdayInTz(lunesAlMediodia)).toBe(1);
    expect(enBsAs(businessDayStart(6, lunesAlMediodia, TZ_NEGOCIO, LUNES_CERRADO))).toBe(
      "2026-08-10, 06:00",
    );
  });

  it("el domingo cierra al corte del lunes, aunque el lunes esté cerrado", () => {
    const domingoALaNoche = new Date("2026-08-09T23:00:00Z"); // 20:00 en BsAs
    expect(enBsAs(businessDayEnd(6, domingoALaNoche, TZ_NEGOCIO, LUNES_CERRADO))).toBe(
      "2026-08-10, 06:00",
    );
  });

  it("antes del corte del lunes todavía es la jornada del domingo", () => {
    const lunesMadrugada = new Date("2026-08-10T08:00:00Z"); // 05:00 en BsAs
    expect(enBsAs(businessDayStart(6, lunesMadrugada, TZ_NEGOCIO, LUNES_CERRADO))).toBe(
      "2026-08-09, 06:00",
    );
    expect(isJornadaActiva(6, lunesMadrugada, TZ_NEGOCIO, LUNES_CERRADO)).toBe(true);
  });

  it("después del corte del lunes no hay jornada activa", () => {
    const lunesAlMediodia = new Date("2026-08-10T15:00:00Z");
    expect(isJornadaActiva(6, lunesAlMediodia, TZ_NEGOCIO, LUNES_CERRADO)).toBe(false);
  });

  it("sin días cerrados la jornada es la de siempre", () => {
    const lunesAlMediodia = new Date("2026-08-10T15:00:00Z");
    expect(enBsAs(businessDayStart(6, lunesAlMediodia))).toBe("2026-08-10, 06:00");
    expect(enBsAs(businessDayEnd(6, lunesAlMediodia))).toBe("2026-08-11, 06:00");
    expect(isJornadaActiva(6, lunesAlMediodia)).toBe(true);
  });

  it("un día abierto no se mueve aunque haya francos", () => {
    const martesALaNoche = new Date("2026-08-11T23:00:00Z"); // 20:00 en BsAs
    expect(enBsAs(businessDayStart(6, martesALaNoche, TZ_NEGOCIO, LUNES_CERRADO))).toBe(
      "2026-08-11, 06:00",
    );
  });

  it("la ventana de reservas mira más adelante para juntar 7 días abiertos", () => {
    const domingo = new Date("2026-08-09T15:00:00Z");
    const sinFrancos = reservationFetchRange(6, domingo);
    const conFranco = reservationFetchRange(6, domingo, TZ_NEGOCIO, LUNES_CERRADO);
    expect(conFranco.end.getTime()).toBeGreaterThan(sinFrancos.end.getTime());
  });

  it("hoy cerrado sigue trayendo reservas de días abiertos y de francos con reservas viejas", () => {
    /* Lunes y miércoles cerrados. El panel tiene que seguir viendo una
     * reserva del martes (se puede crear) y una del miércoles (ya existía). */
    const lunes = new Date("2026-08-10T15:00:00Z");
    const cerrados = [1, 3];
    expect(isJornadaActiva(6, lunes, TZ_NEGOCIO, cerrados)).toBe(false);
    const rango = reservationFetchRange(6, lunes, TZ_NEGOCIO, cerrados);
    const dentro = (iso: string) => {
      const t = new Date(iso).getTime();
      return t >= rango.start.getTime() && t <= rango.end.getTime();
    };
    expect(dentro("2026-08-11T20:00:00-03:00")).toBe(true);
    expect(dentro("2026-08-12T20:00:00-03:00")).toBe(true);
    expect(dentro("2026-08-13T20:00:00-03:00")).toBe(true);
  });

  it("cuántos días de almanaque hacen falta para juntar días abiertos", () => {
    // Desde un domingo (0), con el lunes cerrado: 7 abiertos entran en 8 días.
    expect(calendarDaysForOpenDays(7, 0, LUNES_CERRADO)).toBe(8);
    expect(calendarDaysForOpenDays(7, 0, [])).toBe(7);
  });
});

describe("historial", () => {
  it("'ayer' es la última jornada trabajada, no el franco", () => {
    const martesALaTarde = new Date("2026-08-11T18:00:00Z");
    const rango = rangoDe("ayer", 6, {
      ahora: martesALaTarde,
      cerrados: LUNES_CERRADO,
    });
    /* El lunes cerrado no parte el período: "ayer" es el domingo entero,
     * hasta el corte del lunes. */
    expect(enBsAs(new Date(rango.desde))).toBe("2026-08-09, 06:00");
    expect(enBsAs(new Date(rango.hasta))).toBe("2026-08-10, 06:00");
  });

  it("sin días cerrados 'ayer' sigue siendo el día anterior", () => {
    const martesALaTarde = new Date("2026-08-11T18:00:00Z");
    const rango = rangoDe("ayer", 6, { ahora: martesALaTarde });
    expect(enBsAs(new Date(rango.desde))).toBe("2026-08-10, 06:00");
    expect(enBsAs(new Date(rango.hasta))).toBe("2026-08-11, 06:00");
  });
});
