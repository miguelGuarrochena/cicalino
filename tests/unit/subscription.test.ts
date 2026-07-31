import { describe, it, expect } from "vitest";
import {
  startTrial,
  addCycle,
  branchBillingStart,
  freeDaysForBranch,
  isOverdue,
  isInGrace,
  registerPayment,
  type SubscriptionState,
} from "@/lib/subscription";

describe("prueba gratuita", () => {
  it("30 dias desde el alta, factura al dia siguiente", () => {
    const t = startTrial("2026-08-15");
    expect(t.trialEnd).toBe("2026-09-13");
    expect(t.nextBilling).toBe("2026-09-14");
    expect(t.cycleDay).toBe(14);
  });
});

describe("ciclo mensual con meses cortos", () => {
  it("31 de enero cae en el ultimo dia de febrero", () => {
    expect(addCycle("2026-01-31", 31)).toBe("2026-02-28");
  });

  it("no pierde el dia original al mes siguiente", () => {
    expect(addCycle("2026-02-28", 31)).toBe("2026-03-31");
  });

  it("abril tiene 30 dias", () => {
    expect(addCycle("2026-03-31", 31)).toBe("2026-04-30");
  });

  it("contempla anio bisiesto", () => {
    expect(addCycle("2024-01-31", 31)).toBe("2024-02-29");
  });

  it("el plan anual suma 12 meses", () => {
    expect(addCycle("2026-08-15", 15, "anual")).toBe("2027-08-15");
  });
});

describe("sucursales nuevas", () => {
  it("entran al cobro en la proxima factura del cliente", () => {
    expect(branchBillingStart("2026-09-15", "2026-08-25")).toBe("2026-09-15");
  });

  it("los dias gratis dependen de cuando se agrega", () => {
    expect(freeDaysForBranch("2026-09-15", "2026-08-25")).toBe(21);
    expect(freeDaysForBranch("2026-09-15", "2026-09-14")).toBe(1);
    expect(freeDaysForBranch("2026-09-15", "2026-09-15")).toBe(0);
  });
});

describe("vencimientos", () => {
  const base: SubscriptionState = {
    status: "active",
    plan: "mensual",
    trialEnd: null,
    nextBilling: "2026-09-15",
  };

  it("el dia previo no esta vencido", () => {
    expect(isOverdue(base, "2026-09-14")).toBe(false);
  });

  it("un dia despues si", () => {
    expect(isOverdue(base, "2026-09-16")).toBe(true);
  });

  it("hasta 5 dias tarde sigue en gracia", () => {
    expect(isInGrace(base, "2026-09-18")).toBe(true);
    expect(isInGrace(base, "2026-09-25")).toBe(false);
  });

  it("el plan gratis nunca vence", () => {
    expect(isOverdue({ ...base, plan: "gratis" }, "2026-12-01")).toBe(false);
  });

  it("una cuenta pausada no acumula deuda", () => {
    expect(isOverdue({ ...base, status: "paused" }, "2026-12-01")).toBe(false);
  });

  it("al registrar el pago avanza un mes", () => {
    expect(registerPayment(base, 15).nextBilling).toBe("2026-10-15");
    expect(registerPayment(base, 15).status).toBe("active");
  });
});
