import { describe, it, expect } from "vitest";
import { rangoDe, PAGINA_HISTORIAL } from "@/lib/historial";

/* Los períodos del historial.
 *
 * Todo esto existe por una razón sola: el día del negocio no empieza a
 * medianoche. Con corte a las 6, a las 2 de la mañana el mozo sigue trabajando
 * en la jornada de ayer, y "Hoy" tiene que darle lo que viene atendiendo — no
 * una lista vacía porque el reloj pasó las doce.
 *
 * Las horas esperadas están en UTC: Argentina es UTC-3, así que el corte de
 * las 6 de la mañana cae a las 09:00Z. */
const CORTE = 6;
/* Miércoles 17 de septiembre, 20:00 en Buenos Aires. */
const tarde = new Date("2026-09-17T23:00:00Z");
/* Jueves 18, 02:00 en Buenos Aires: todavía la jornada del miércoles. */
const madrugada = new Date("2026-09-18T05:00:00Z");

describe("rangos del historial", () => {
  it("hoy es la jornada, no el día del reloj", () => {
    const a = rangoDe("hoy", CORTE, { ahora: tarde });
    expect(a.desde).toBe("2026-09-17T09:00:00.000Z");
    expect(a.hasta).toBe("2026-09-18T09:00:00.000Z");

    /* A las 2 de la mañana del jueves, "hoy" sigue siendo el mismo tramo. */
    expect(rangoDe("hoy", CORTE, { ahora: madrugada })).toEqual(a);
  });

  it("ayer termina donde arranca hoy, sin pisarse ni dejar un hueco", () => {
    const hoy = rangoDe("hoy", CORTE, { ahora: tarde });
    const ayer = rangoDe("ayer", CORTE, { ahora: tarde });
    expect(ayer.hasta).toBe(hoy.desde);
    expect(ayer.desde).toBe("2026-09-16T09:00:00.000Z");
  });

  it("últimos 7 días cuenta siete jornadas, con la de hoy adentro", () => {
    const r = rangoDe("7d", CORTE, { ahora: tarde });
    expect(r.desde).toBe("2026-09-11T09:00:00.000Z");
    expect(r.hasta).toBe("2026-09-18T09:00:00.000Z");
    const dias = (new Date(r.hasta).getTime() - new Date(r.desde).getTime()) / 86_400_000;
    expect(dias).toBe(7);
  });

  it("este mes arranca en la primera jornada del mes del negocio", () => {
    const r = rangoDe("mes", CORTE, { ahora: tarde });
    expect(r.desde).toBe("2026-09-01T09:00:00.000Z");
    expect(r.hasta).toBe("2026-09-18T09:00:00.000Z");
  });

  it("el rango personalizado incluye entera la jornada del último día", () => {
    const r = rangoDe("personalizado", CORTE, {
      desde: "2026-09-10",
      hasta: "2026-09-12",
      ahora: tarde,
    });
    expect(r.desde).toBe("2026-09-10T09:00:00.000Z");
    /* Si cortara en el inicio del 12 se perdería todo el servicio de ese día. */
    expect(r.hasta).toBe("2026-09-13T09:00:00.000Z");
  });

  it("un solo día elegido es esa jornada sola", () => {
    const r = rangoDe("personalizado", CORTE, { desde: "2026-09-10", ahora: tarde });
    expect(r.desde).toBe("2026-09-10T09:00:00.000Z");
    expect(r.hasta).toBe("2026-09-11T09:00:00.000Z");
  });

  it("sin fecha elegida, personalizado no rompe: cae en la jornada de hoy", () => {
    expect(rangoDe("personalizado", CORTE, { ahora: tarde })).toEqual(
      rangoDe("hoy", CORTE, { ahora: tarde }),
    );
  });

  it("respeta el corte del local, no uno fijo", () => {
    /* Un local que cierra a las 3: a las 2 de la mañana del jueves todavía es
     * la jornada del miércoles; a las 4 ya sería la del jueves. */
    const r = rangoDe("hoy", 3, { ahora: madrugada });
    expect(r.desde).toBe("2026-09-17T06:00:00.000Z");
    expect(r.hasta).toBe("2026-09-18T06:00:00.000Z");
  });

  it("la página es chica: el historial se pide de a poco", () => {
    expect(PAGINA_HISTORIAL).toBeLessThanOrEqual(50);
  });
});
