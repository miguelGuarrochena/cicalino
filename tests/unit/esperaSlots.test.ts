import { describe, it, expect, vi, afterEach } from "vitest";
import {
  minsAgo,
  pad2,
  toLocalInput,
  snapMinutesToSlot,
  dateKeyFromLocal,
  timeKeyFromLocal,
  combineLocalHorario,
  addDaysKey,
  buildDayOptions,
  buildTimeSlots,
  allTimeSlots,
  availableTimeSlots,
  todayDateKey,
} from "@/lib/espera/slots";

/* Las cuentas de fechas del picker de reservas. Vivían sueltas arriba de la
 * página y no tenían un solo test: son el tipo de código que se rompe sin
 * avisar y recién se nota cuando alguien reserva a la hora equivocada. */

afterEach(() => {
  vi.useRealTimers();
});

/* Se congela con offset explícito de Argentina (-03:00).
 *
 * Antes iba sin offset, así que el instante congelado dependía de la zona de
 * la máquina — y como el picker también leía la hora local, los tests pasaban
 * en cualquier lado por casualidad. Ahora el picker razona en hora argentina,
 * así que el instante tiene que ser inequívoco: si no, este archivo pasa en
 * una laptop en Buenos Aires y falla en el runner de CI, que corre en UTC. */
const congelar = (horaArgentina: string) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${horaArgentina}-03:00`));
};

describe("pad2 / toLocalInput", () => {
  it("rellena a dos dígitos", () => {
    expect(pad2(7)).toBe("07");
    expect(pad2(23)).toBe("23");
  });

  it("arma el formato que espera un input datetime-local", () => {
    expect(toLocalInput(new Date(2026, 7, 9, 5, 4))).toBe("2026-08-09T05:04");
  });
});

describe("minsAgo", () => {
  it("cuenta los minutos desde una fecha pasada", () => {
    congelar("2026-08-07T21:30:00");
    expect(minsAgo("2026-08-07T21:00:00-03:00")).toBe(30);
  });

  it("una fecha futura da cero, no negativo", () => {
    congelar("2026-08-07T21:00:00");
    expect(minsAgo("2026-08-07T21:30:00-03:00")).toBe(0);
  });
});

describe("snapMinutesToSlot", () => {
  const min = (h: number, m: number) => h * 60 + m;

  it("redondea hacia arriba al bloque de 15", () => {
    expect(snapMinutesToSlot(min(20, 1))).toBe(min(20, 15));
    expect(snapMinutesToSlot(min(20, 16))).toBe(min(20, 30));
    expect(snapMinutesToSlot(min(20, 44))).toBe(min(20, 45));
  });

  it("una hora ya en punto no se mueve", () => {
    expect(snapMinutesToSlot(min(20, 0))).toBe(min(20, 0));
  });

  it("pasadas las y 45 salta a la hora siguiente", () => {
    expect(snapMinutesToSlot(min(20, 46))).toBe(min(21, 0));
  });

  it("después del último bloque del día se pasa de 1439", () => {
    expect(snapMinutesToSlot(min(23, 50))).toBeGreaterThan(1439);
  });
});

describe("claves de fecha y hora", () => {
  it("parten el valor local en sus dos mitades", () => {
    expect(dateKeyFromLocal("2026-08-09T20:30")).toBe("2026-08-09");
    expect(timeKeyFromLocal("2026-08-09T20:30")).toBe("20:30");
  });

  it("combinar es la inversa de partir", () => {
    const local = "2026-08-09T20:30";
    expect(
      combineLocalHorario(dateKeyFromLocal(local), timeKeyFromLocal(local)),
    ).toBe(local);
  });

  it("addDaysKey cruza el fin de mes", () => {
    expect(addDaysKey("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDaysKey("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("addDaysKey también va para atrás", () => {
    expect(addDaysKey("2026-09-01", -1)).toBe("2026-08-31");
  });
});

describe("allTimeSlots", () => {
  it("va de 11:00 a 23:00 cada 15 minutos", () => {
    expect(allTimeSlots[0]).toBe("11:00");
    expect(allTimeSlots.at(-1)).toBe("23:00");
    expect(allTimeSlots).toHaveLength((23 * 60 - 11 * 60) / 15 + 1);
  });

  it("está ordenado y sin repetidos", () => {
    expect([...allTimeSlots].sort()).toEqual(allTimeSlots);
    expect(new Set(allTimeSlots).size).toBe(allTimeSlots.length);
  });
});

describe("availableTimeSlots", () => {
  it("para un día futuro ofrece todas las franjas", () => {
    congelar("2026-08-07T20:00:00");
    expect(availableTimeSlots("2026-08-09")).toEqual(allTimeSlots);
  });

  it("para hoy no ofrece horarios ya pasados", () => {
    congelar("2026-08-07T20:10:00");
    const slots = availableTimeSlots(todayDateKey());
    expect(slots).not.toContain("11:00");
    expect(slots).not.toContain("20:00");
    expect(slots[0]).toBe("20:15");
  });

  it("pasada la última franja, hoy se queda sin horarios", () => {
    congelar("2026-08-07T23:50:00");
    expect(availableTimeSlots(todayDateKey())).toEqual([]);
  });

  it("antes de abrir, hoy ofrece todas", () => {
    congelar("2026-08-07T08:00:00");
    expect(availableTimeSlots(todayDateKey())).toEqual(allTimeSlots);
  });
});

describe("buildDayOptions", () => {
  it("arranca hoy y ofrece una ventana de días", () => {
    congelar("2026-08-07T12:00:00");
    const dias = buildDayOptions("es");
    expect(dias.length).toBeGreaterThan(1);
    expect(dias[0]?.key).toBe(todayDateKey());
  });

  it("las claves son consecutivas y sin huecos", () => {
    congelar("2026-08-07T12:00:00");
    const dias = buildDayOptions("es");
    for (let i = 1; i < dias.length; i++) {
      expect(dias[i]!.key).toBe(addDaysKey(dias[i - 1]!.key, 1));
    }
  });

  it("omite los días cerrados del local", () => {
    /* 2026-08-07 es viernes (5). Cerramos sábados y domingos. */
    congelar("2026-08-07T12:00:00");
    const dias = buildDayOptions("es", { closedWeekdays: [0, 6] });
    expect(dias.map((d) => d.key)).toEqual([
      "2026-08-07",
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-17",
    ]);
  });

  it("cruza el fin de mes sin romperse", () => {
    congelar("2026-08-30T12:00:00");
    const dias = buildDayOptions("es");
    expect(dias.map((d) => d.key)).toContain("2026-09-01");
  });
});

describe("buildTimeSlots / availableTimeSlots con ventana del local", () => {
  it("respeta abre/cierra del local", () => {
    const slots = buildTimeSlots(12 * 60, 15 * 60);
    expect(slots[0]).toBe("12:00");
    expect(slots.at(-1)).toBe("15:00");
  });

  it("filtra el día de hoy dentro de la ventana", () => {
    congelar("2026-08-07T13:10:00");
    const slots = availableTimeSlots(todayDateKey(), {
      startMin: 12 * 60,
      endMin: 15 * 60,
    });
    expect(slots[0]).toBe("13:15");
    expect(slots.at(-1)).toBe("15:00");
  });
});
