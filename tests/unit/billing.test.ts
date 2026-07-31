import { describe, it, expect } from "vitest";
import {
  addBillingCycle,
  isOrgBillingDue,
  billingReason,
} from "@/lib/billing";

describe("sumarCicloCobro", () => {
  it("suma un mes en plan mensual", () => {
    const d = addBillingCycle("mensual", new Date("2026-01-15T12:00:00Z"));
    expect(d?.toISOString().slice(0, 7)).toBe("2026-02");
  });
  it("suma un año en plan anual", () => {
    const d = addBillingCycle("anual", new Date("2026-01-15T12:00:00Z"));
    expect(d?.getFullYear()).toBe(2027);
  });
  it("gratis no tiene ciclo", () => {
    expect(addBillingCycle("gratis")).toBeNull();
  });
});

describe("orgCobroPendiente", () => {
  const base = {
    activo: true,
    pagado: true,
    plan: "mensual" as const,
    freeMonthUntil: null,
    nextChargeAt: null,
  };

  it("impago activo requiere atención", () => {
    expect(isOrgBillingDue({ ...base, pagado: false })).toBe(true);
  });

  it("pagado sin fecha no alerta", () => {
    expect(isOrgBillingDue(base)).toBe(false);
  });

  it("vencido alerta", () => {
    const hace = new Date();
    hace.setDate(hace.getDate() - 3);
    expect(
      isOrgBillingDue({ ...base, nextChargeAt: hace.toISOString() }),
    ).toBe(true);
    expect(
      billingReason({ ...base, nextChargeAt: hace.toISOString() }),
    ).toMatch(/Venció/);
  });
});
