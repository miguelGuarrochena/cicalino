import { describe, it, expect } from "vitest";
import {
  isValidWaitlistTransition,
  isValidReservationTransition,
  waitlistTransitionSources,
  reservationTransitionSources,
  orderTransitionSources,
  isValidTransition,
} from "@/lib/schemas";

/* Estas tablas son el espejo de los triggers de espera-constraints.sql. Si
 * alguna de las dos cambia sin la otra, la base y el panel dejan de coincidir
 * y el síntoma es un update que no hace nada sin explicación. */

describe("transiciones de espera", () => {
  it("el camino normal es esperando → avisado → sentado", () => {
    expect(isValidWaitlistTransition("esperando", "avisado")).toBe(true);
    expect(isValidWaitlistTransition("avisado", "sentado")).toBe(true);
  });

  it("se puede sentar sin avisar", () => {
    expect(isValidWaitlistTransition("esperando", "sentado")).toBe(true);
  });

  it("se puede cancelar mientras siga en la cola", () => {
    expect(isValidWaitlistTransition("esperando", "cancelado")).toBe(true);
    expect(isValidWaitlistTransition("avisado", "cancelado")).toBe(true);
  });

  it("sentado y cancelado son finales", () => {
    for (const hacia of ["esperando", "avisado", "sentado", "cancelado"]) {
      expect(isValidWaitlistTransition("sentado", hacia)).toBe(false);
      expect(isValidWaitlistTransition("cancelado", hacia)).toBe(false);
    }
  });

  it("no se puede volver atrás", () => {
    expect(isValidWaitlistTransition("avisado", "esperando")).toBe(false);
  });

  it("un estado desconocido no habilita nada", () => {
    expect(isValidWaitlistTransition("inventado", "sentado")).toBe(false);
  });
});

describe("transiciones de reserva", () => {
  it("desde activa se puede sentar, cancelar o expirar", () => {
    expect(isValidReservationTransition("activa", "sentada")).toBe(true);
    expect(isValidReservationTransition("activa", "cancelada")).toBe(true);
    expect(isValidReservationTransition("activa", "expirada")).toBe(true);
  });

  it("una vez cerrada no se reabre", () => {
    for (const desde of ["sentada", "cancelada", "expirada"]) {
      expect(isValidReservationTransition(desde, "activa")).toBe(false);
      expect(isValidReservationTransition(desde, "sentada")).toBe(false);
    }
  });
});

describe("orígenes para el compare-and-swap", () => {
  it("a sentado se llega desde esperando o avisado", () => {
    expect(waitlistTransitionSources("sentado").sort()).toEqual([
      "avisado",
      "esperando",
    ]);
  });

  it("a avisado solo desde esperando", () => {
    expect(waitlistTransitionSources("avisado")).toEqual(["esperando"]);
  });

  it("a cancelado desde cualquiera de los dos abiertos", () => {
    expect(waitlistTransitionSources("cancelado").sort()).toEqual([
      "avisado",
      "esperando",
    ]);
  });

  it("las reservas solo se mueven desde activa", () => {
    for (const hacia of ["sentada", "cancelada", "expirada"]) {
      expect(reservationTransitionSources(hacia)).toEqual(["activa"]);
    }
  });

  it("un destino inalcanzable no devuelve orígenes", () => {
    // Sin orígenes, updateWaitlistStatus corta antes de tocar la base.
    expect(waitlistTransitionSources("esperando")).toEqual([]);
    expect(reservationTransitionSources("activa")).toEqual([]);
  });

  it("los orígenes son coherentes con la tabla de transiciones", () => {
    const estados = ["esperando", "avisado", "sentado", "cancelado"];
    for (const hacia of estados) {
      for (const desde of estados) {
        expect(waitlistTransitionSources(hacia).includes(desde)).toBe(
          isValidWaitlistTransition(desde, hacia),
        );
      }
    }
  });
});

describe("orígenes de pedido", () => {
  it("el CAS no adivina un único estado previo", () => {
    expect(orderTransitionSources("listo").sort()).toEqual([
      "creado",
      "en_preparacion",
    ]);
  });

  it("coinciden con isValidTransition", () => {
    const estados = [
      "creado",
      "en_preparacion",
      "listo",
      "retirado",
      "cancelado",
    ];
    for (const hacia of estados) {
      for (const desde of estados) {
        expect(orderTransitionSources(hacia).includes(desde)).toBe(
          isValidTransition(desde, hacia),
        );
      }
    }
  });
});
