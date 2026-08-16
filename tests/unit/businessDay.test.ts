import { describe, it, expect } from "vitest";
import {
  businessDayStart,
  businessDayEnd,
  reservationFetchRange,
  instantFromBusinessWallClock,
  dateKeyInTz,
  minutesOfDayInTz,
  TZ_NEGOCIO,
} from "@/lib/businessDay";

/* La jornada tiene que dar lo mismo en cualquier dispositivo. Antes salía de
 * `new Date().getHours()`, así que dos tablets del mismo mostrador con la zona
 * distinta veían listas distintas. */

/* Qué hora de pared marca ese instante en la zona del negocio. */
const enBsAs = (d: Date): string =>
  formatear(d).replace(/, 24:/, ", 00:");

const formatear = (d: Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_NEGOCIO,
    /* h23, no `hour12: false`. Con hour12 el ciclo lo elige el ICU: en macOS
     * la medianoche sale "00" y en el Linux del CI sale "24", así que este
     * mismo test pasaba local y fallaba en CI. */
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);

/* La normalización de arriba es cinturón y tiradores: `hourCycle: "h23"` ya
 * debería dar 00, pero este test pasó local y falló en CI justamente por esto
 * y prefiero que no dependa de qué ICU tenga el runner. */

describe("businessDayStart", () => {
  it("después del corte, la jornada arrancó hoy", () => {
    // 14:00 en Buenos Aires (UTC-3)
    const ahora = new Date("2026-08-07T17:00:00Z");
    expect(enBsAs(businessDayStart(6, ahora))).toBe("2026-08-07, 06:00");
  });

  it("antes del corte, seguís en la jornada de ayer", () => {
    // 03:00 en Buenos Aires: el turno de anoche
    const ahora = new Date("2026-08-07T06:00:00Z");
    expect(enBsAs(businessDayStart(6, ahora))).toBe("2026-08-06, 06:00");
  });

  it("justo en la hora de corte ya es la jornada nueva", () => {
    const ahora = new Date("2026-08-07T09:00:00Z"); // 06:00 en BsAs
    expect(enBsAs(businessDayStart(6, ahora))).toBe("2026-08-07, 06:00");
  });

  it("un minuto antes del corte todavía es la anterior", () => {
    const ahora = new Date("2026-08-07T08:59:00Z"); // 05:59 en BsAs
    expect(enBsAs(businessDayStart(6, ahora))).toBe("2026-08-06, 06:00");
  });

  it("cruza el fin de mes hacia atrás", () => {
    const ahora = new Date("2026-09-01T06:00:00Z"); // 03:00 del 1/9
    expect(enBsAs(businessDayStart(6, ahora))).toBe("2026-08-31, 06:00");
  });

  it("cruza el fin de año hacia atrás", () => {
    const ahora = new Date("2027-01-01T06:00:00Z"); // 03:00 del 1/1
    expect(enBsAs(businessDayStart(6, ahora))).toBe("2026-12-31, 06:00");
  });

  it("con corte 0 la jornada es el día calendario", () => {
    const ahora = new Date("2026-08-07T06:00:00Z"); // 03:00 en BsAs
    expect(enBsAs(businessDayStart(0, ahora))).toBe("2026-08-07, 00:00");
  });

  it("con corte 23 casi todo el día es la jornada anterior", () => {
    const ahora = new Date("2026-08-07T17:00:00Z"); // 14:00 en BsAs
    expect(enBsAs(businessDayStart(23, ahora))).toBe("2026-08-06, 23:00");
  });
});

describe("businessDayEnd", () => {
  it("es la misma hora de corte del día siguiente", () => {
    const ahora = new Date("2026-08-07T17:00:00Z");
    expect(enBsAs(businessDayEnd(6, ahora))).toBe("2026-08-08, 06:00");
  });

  it("dura exactamente un día", () => {
    const ahora = new Date("2026-08-07T17:00:00Z");
    const ms = businessDayEnd(6, ahora).getTime() - businessDayStart(6, ahora).getTime();
    expect(ms).toBe(86_400_000);
  });

  it("el cierre siempre es posterior al arranque", () => {
    for (const iso of [
      "2026-01-01T02:00:00Z",
      "2026-06-15T12:00:00Z",
      "2026-12-31T23:59:00Z",
    ]) {
      const ahora = new Date(iso);
      expect(businessDayEnd(6, ahora).getTime()).toBeGreaterThan(
        businessDayStart(6, ahora).getTime(),
      );
    }
  });
});

describe("independencia del dispositivo", () => {
  it("dos dispositivos en husos distintos calculan la misma jornada", () => {
    /* El mismo instante real. Antes esto dependía de getHours() del navegador,
     * así que cada uno resolvía una jornada distinta; ahora la zona la fija la
     * función y el resultado es el mismo instante UTC. */
    const instante = new Date("2026-08-07T17:00:00Z");
    const desdeTokio = businessDayStart(6, instante, TZ_NEGOCIO);
    const desdeMadrid = businessDayStart(6, instante, TZ_NEGOCIO);
    expect(desdeTokio.getTime()).toBe(desdeMadrid.getTime());
  });

  it("el resultado es un instante absoluto, no una hora local", () => {
    // 06:00 en Buenos Aires = 09:00 UTC
    const ahora = new Date("2026-08-07T17:00:00Z");
    expect(businessDayStart(6, ahora).toISOString()).toBe(
      "2026-08-07T09:00:00.000Z",
    );
  });
});

describe("reservationFetchRange", () => {
  it("antes del corte incluye la mañana de hoy, que ya salió de la jornada", () => {
    /* 05:25 en Buenos Aires: la jornada abierta cierra a las 06:00. Una
     * reserva a las 06:15 queda fuera de businessDayEnd y el panel no la
     * cargaba; crear_reserva igual la veía y devolvía choque. */
    const ahora = new Date("2026-08-12T08:25:00Z");
    const jornada = {
      start: businessDayStart(6, ahora),
      end: businessDayEnd(6, ahora),
    };
    const rango = reservationFetchRange(6, ahora);
    const reservaManana = new Date("2026-08-12T09:15:00Z"); // 06:15 BsAs

    expect(reservaManana.getTime()).toBeGreaterThan(jornada.end.getTime());
    expect(reservaManana.getTime()).toBeGreaterThanOrEqual(rango.start.getTime());
    expect(reservaManana.getTime()).toBeLessThanOrEqual(rango.end.getTime());
  });

  it("cubre los 7 días del picker aunque la jornada abierta sea la de ayer", () => {
    const ahora = new Date("2026-08-12T08:25:00Z"); // antes del corte
    const rango = reservationFetchRange(6, ahora);
    // Día 7 del picker contando desde el arranque de jornada (ayer 06:00):
    // alcanza a cubrir "hoy" + varios días más.
    expect(rango.end.getTime() - rango.start.getTime()).toBeGreaterThanOrEqual(
      7 * 86_400_000,
    );
  });
});

/* El horario de la reserva sale del reloj de pared del negocio, no del
 * dispositivo. Era el último lugar donde seguía mandando la zona local: el
 * picker devuelve "2026-08-09T21:00" sin offset y `new Date(...)` lo leía como
 * hora del dispositivo, mientras la agenda siempre mostró en hora argentina.
 * En una tablet mal configurada la reserva se guardaba en un instante y
 * aparecía en otro. */
describe("instantFromBusinessWallClock", () => {
  it("las 21:00 del picker son las 21:00 en Buenos Aires", () => {
    const d = instantFromBusinessWallClock("2026-08-09", "21:00");
    expect(d).not.toBeNull();
    expect(enBsAs(d!)).toBe("2026-08-09, 21:00");
  });

  it("da el mismo instante sea cual sea la zona del dispositivo", () => {
    /* Este helper no lee la zona local en ningún momento: el instante es una
     * función pura de (día, hora, zona del negocio). Si alguien reintroduce un
     * `new Date("...")` sin offset, este UTC deja de dar. */
    const d = instantFromBusinessWallClock("2026-08-09", "21:00");
    expect(d!.toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });

  it("respeta los minutos, no solo la hora", () => {
    const d = instantFromBusinessWallClock("2026-08-09", "21:45");
    expect(enBsAs(d!)).toBe("2026-08-09, 21:45");
  });

  it("cruza el fin de mes y el fin de año sin correrse", () => {
    expect(enBsAs(instantFromBusinessWallClock("2026-08-31", "23:45")!)).toBe(
      "2026-08-31, 23:45",
    );
    expect(enBsAs(instantFromBusinessWallClock("2026-12-31", "23:45")!)).toBe(
      "2026-12-31, 23:45",
    );
  });

  it("devuelve null ante claves mal formadas en vez de un Invalid Date", () => {
    expect(instantFromBusinessWallClock("", "21:00")).toBeNull();
    expect(instantFromBusinessWallClock("2026-08-09", "")).toBeNull();
    expect(instantFromBusinessWallClock("2026-8-9", "21:00")).toBeNull();
    expect(instantFromBusinessWallClock("2026-08-09", "9:00")).toBeNull();
    expect(instantFromBusinessWallClock("2026-13-09", "21:00")).toBeNull();
    expect(instantFromBusinessWallClock("2026-08-09", "24:00")).toBeNull();
    expect(instantFromBusinessWallClock("2026-08-09", "21:60")).toBeNull();
  });
});

describe("dateKeyInTz / minutesOfDayInTz", () => {
  it("a las 23:30 de Buenos Aires todavía es el mismo día, aunque en UTC ya sea el siguiente", () => {
    const ahora = new Date("2026-08-10T02:30:00Z"); // 23:30 del 9 en BsAs
    expect(dateKeyInTz(ahora)).toBe("2026-08-09");
    expect(minutesOfDayInTz(ahora)).toBe(23 * 60 + 30);
  });

  it("a las 00:30 de Buenos Aires ya es el día nuevo", () => {
    const ahora = new Date("2026-08-10T03:30:00Z"); // 00:30 del 10 en BsAs
    expect(dateKeyInTz(ahora)).toBe("2026-08-10");
    expect(minutesOfDayInTz(ahora)).toBe(30);
  });

  it("la clave siempre queda con dos dígitos en mes y día", () => {
    expect(dateKeyInTz(new Date("2026-01-05T15:00:00Z"))).toBe("2026-01-05");
  });
});
