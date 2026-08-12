import { describe, it, expect } from "vitest";
import {
  isWithinGrace,
  tablesHeldByReservation,
  isReservationHolding,
  tablesInFloorHold,
  HOLD_BEFORE_MIN,
} from "@/lib/reservations";
import type { ReservationView } from "@/lib/types";

const AT = new Date("2026-08-07T21:00:00Z");
const at = (offsetMin: number) => AT.getTime() + offsetMin * 60_000;

const mkReserva = (over: Partial<ReservationView> = {}): ReservationView => ({
  id: "r1",
  name: "Pérez",
  partySize: 4,
  tableNumber: 3,
  tableNumbers: [3],
  scheduledAt: AT.toISOString(),
  graceMinutes: 15,
  status: "activa",
  createdAt: AT.toISOString(),
  seatedAt: null,
  cancelledAt: null,
  expiredAt: null,
  employee: null,
  ...over,
});

/* Mirrors mesa_en_ventana_de_reserva in supabase/sentar-walkin.sql. If one
 * changes the other has to change too. */

describe("isWithinGrace", () => {
  it("no aplica antes del horario", () => {
    expect(isWithinGrace(mkReserva(), at(-1))).toBe(false);
    expect(isWithinGrace(mkReserva(), at(-60))).toBe(false);
  });

  it("arranca justo en el horario", () => {
    expect(isWithinGrace(mkReserva(), at(0))).toBe(true);
  });

  it("cubre toda la tolerancia, incluido el último minuto", () => {
    expect(isWithinGrace(mkReserva(), at(7))).toBe(true);
    expect(isWithinGrace(mkReserva(), at(15))).toBe(true);
  });

  it("se corta apenas vence", () => {
    expect(isWithinGrace(mkReserva(), at(16))).toBe(false);
  });

  it("respeta una tolerancia de 20", () => {
    const r = mkReserva({ graceMinutes: 20 });
    expect(isWithinGrace(r, at(18))).toBe(true);
    expect(isWithinGrace(r, at(21))).toBe(false);
  });

  it("solo cuenta si la reserva sigue activa", () => {
    for (const status of ["sentada", "cancelada", "expirada"] as const) {
      expect(isWithinGrace(mkReserva({ status }), at(5))).toBe(false);
    }
  });

  it("una fecha inválida no bloquea nada", () => {
    expect(isWithinGrace(mkReserva({ scheduledAt: "no-es-fecha" }), at(0))).toBe(
      false,
    );
  });
});

describe("tablesHeldByReservation", () => {
  it("toma todas las mesas de la reserva, no solo la primaria", () => {
    const held = tablesHeldByReservation(
      [mkReserva({ tableNumber: 3, tableNumbers: [3, 4, 5] })],
      at(5),
    );
    expect([...held.keys()].sort()).toEqual([3, 4, 5]);
  });

  it("fuera de la ventana no retiene ninguna", () => {
    const r = [mkReserva()];
    expect(tablesHeldByReservation(r, at(-5)).size).toBe(0);
    expect(tablesHeldByReservation(r, at(30)).size).toBe(0);
  });

  it("con varias reservas retiene solo las que están en ventana", () => {
    const held = tablesHeldByReservation(
      [
        mkReserva({ id: "a", tableNumbers: [1] }),
        mkReserva({
          id: "b",
          tableNumbers: [2],
          scheduledAt: new Date(at(120)).toISOString(),
        }),
      ],
      at(5),
    );
    expect([...held.keys()]).toEqual([1]);
  });

  it("si dos reservas pisan la misma mesa gana la más temprana", () => {
    const held = tablesHeldByReservation(
      [
        mkReserva({
          id: "tarde",
          tableNumbers: [7],
          scheduledAt: new Date(at(10)).toISOString(),
          graceMinutes: 20,
        }),
        mkReserva({ id: "temprano", tableNumbers: [7] }),
      ],
      at(12),
    );
    expect(held.get(7)?.id).toBe("temprano");
  });

  it("sin reservas devuelve vacío", () => {
    expect(tablesHeldByReservation([], at(0)).size).toBe(0);
  });
});

describe("isReservationHolding", () => {
  it("arranca HOLD_BEFORE minutos antes del horario", () => {
    expect(isReservationHolding(mkReserva(), at(-(HOLD_BEFORE_MIN + 1)))).toBe(
      false,
    );
    expect(isReservationHolding(mkReserva(), at(-HOLD_BEFORE_MIN))).toBe(true);
    expect(isReservationHolding(mkReserva(), at(-1))).toBe(true);
  });

  it("sigue durante la gracia y corta al vencer", () => {
    expect(isReservationHolding(mkReserva(), at(0))).toBe(true);
    expect(isReservationHolding(mkReserva(), at(15))).toBe(true);
    expect(isReservationHolding(mkReserva(), at(16))).toBe(false);
  });
});

describe("tablesInFloorHold", () => {
  it("marca la mesa antes de la gracia, para el mapa", () => {
    const held = tablesInFloorHold([mkReserva()], at(-20));
    expect(held.get(3)?.id).toBe("r1");
    expect(tablesHeldByReservation([mkReserva()], at(-20)).size).toBe(0);
  });
});
