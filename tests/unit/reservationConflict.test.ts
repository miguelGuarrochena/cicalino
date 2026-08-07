import { describe, it, expect } from "vitest";
import {
  conflictingReservation,
  MIN_GAP_BETWEEN_RESERVATIONS,
} from "@/lib/reservations";
import type { ReservationView } from "@/lib/types";

const AT = new Date("2026-08-07T21:00:00Z");
const at = (offsetMin: number) =>
  new Date(AT.getTime() + offsetMin * 60_000).toISOString();

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

/* This is the same rule as `crear_reserva` in supabase/reservas-atomicas.sql,
 * which is the one that actually enforces it. This copy only drives the picker
 * in the panel, so they have to agree or the UI offers slots the server then
 * rejects. */

describe("conflictingReservation", () => {
  it("choca con otra reserva en la misma mesa dentro del gap", () => {
    const otras = [mkReserva()];
    expect(conflictingReservation([3], at(30), otras)?.id).toBe("r1");
    expect(conflictingReservation([3], at(-30), otras)?.id).toBe("r1");
  });

  it("justo en el gap ya no choca", () => {
    const otras = [mkReserva()];
    expect(
      conflictingReservation([3], at(MIN_GAP_BETWEEN_RESERVATIONS), otras),
    ).toBeNull();
  });

  it("un minuto antes del gap sí choca", () => {
    const otras = [mkReserva()];
    expect(
      conflictingReservation([3], at(MIN_GAP_BETWEEN_RESERVATIONS - 1), otras),
    ).not.toBeNull();
  });

  it("no choca si es otra mesa", () => {
    expect(conflictingReservation([9], at(10), [mkReserva()])).toBeNull();
  });

  it("detecta el choque en una mesa secundaria, no solo la primaria", () => {
    const otras = [mkReserva({ tableNumber: 3, tableNumbers: [3, 4] })];
    expect(conflictingReservation([4], at(10), otras)?.id).toBe("r1");
  });

  it("alcanza con que se pise una mesa del grupo", () => {
    const otras = [mkReserva({ tableNumbers: [3, 4] })];
    expect(conflictingReservation([4, 5, 6], at(10), otras)?.id).toBe("r1");
  });

  it("las reservas que no están activas no bloquean", () => {
    for (const status of ["sentada", "cancelada", "expirada"] as const) {
      expect(
        conflictingReservation([3], at(10), [mkReserva({ status })]),
      ).toBeNull();
    }
  });

  it("se puede excluir una reserva por id, para editarla", () => {
    const otras = [mkReserva({ id: "r1" })];
    expect(conflictingReservation([3], at(10), otras, "r1")).toBeNull();
  });

  it("un horario inválido no bloquea nada", () => {
    expect(
      conflictingReservation([3], "no-es-fecha", [mkReserva()]),
    ).toBeNull();
  });

  it("sin otras reservas nunca choca", () => {
    expect(conflictingReservation([3], at(0), [])).toBeNull();
  });

  it("devuelve la reserva con la que choca, para poder nombrarla", () => {
    const otras = [
      mkReserva({ id: "lejos", scheduledAt: at(200) }),
      mkReserva({ id: "cerca", scheduledAt: at(20) }),
    ];
    expect(conflictingReservation([3], at(0), otras)?.id).toBe("cerca");
  });
});
