import { describe, it, expect, vi, afterEach } from "vitest";
import {
  minsAgo,
  pad2,
  toLocalInput,
  snapToSlot,
  dateKeyFromLocal,
  timeKeyFromLocal,
  combineLocalHorario,
  addDaysKey,
  buildDayOptions,
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

const congelar = (iso: string) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
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
    expect(minsAgo(new Date("2026-08-07T21:00:00").toISOString())).toBe(30);
  });

  it("una fecha futura da cero, no negativo", () => {
    congelar("2026-08-07T21:00:00");
    expect(minsAgo(new Date("2026-08-07T21:30:00").toISOString())).toBe(0);
  });
});

describe("snapToSlot", () => {
  it("redondea hacia arriba al bloque de 15", () => {
    expect(snapToSlot(new Date(2026, 7, 7, 20, 1)).getMinutes()).toBe(15);
    expect(snapToSlot(new Date(2026, 7, 7, 20, 16)).getMinutes()).toBe(30);
    expect(snapToSlot(new Date(2026, 7, 7, 20, 44)).getMinutes()).toBe(45);
  });

  it("una hora ya en punto no se mueve", () => {
    const d = snapToSlot(new Date(2026, 7, 7, 20, 0));
    expect(d.getMinutes()).toBe(0);
    expect(d.getHours()).toBe(20);
  });

  it("pasadas las y 45 salta a la hora siguiente", () => {
    const d = snapToSlot(new Date(2026, 7, 7, 20, 46));
    expect(d.getHours()).toBe(21);
    expect(d.getMinutes()).toBe(0);
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
  it("va de 11:00 a 23:45 cada 15 minutos", () => {
    expect(allTimeSlots[0]).toBe("11:00");
    expect(allTimeSlots.at(-1)).toBe("23:45");
    expect(allTimeSlots).toHaveLength((23 * 60 + 45 - 11 * 60) / 15 + 1);
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

  it("cruza el fin de mes sin romperse", () => {
    congelar("2026-08-30T12:00:00");
    const dias = buildDayOptions("es");
    expect(dias.map((d) => d.key)).toContain("2026-09-01");
  });
});
