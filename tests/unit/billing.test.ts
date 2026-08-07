import { describe, it, expect } from "vitest";
import {
  addBillingCycle,
  isOrgBillingDue,
  billingReason,
  type OrgBilling,
} from "@/lib/billing";

describe("addBillingCycle", () => {
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

/* Devuelve una fecha para la que `daysUntil` reporta exactamente `dias`.
 *
 * Hace falta el -1 porque daysUntil mide hasta el final del día: una fecha a
 * N días de distancia da N+1. Compensarlo acá deja que cada test diga el
 * número que quiere decir. */
const aDias = (dias: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + dias - 1);
  return d.toISOString();
};

const org = (over: Partial<OrgBilling> = {}): OrgBilling => ({
  activo: true,
  plan: "mensual",
  status: "active",
  freeMonthUntil: null,
  nextInvoice: null,
  ...over,
});

/* El panel de Cobros decide con esto a quién mostrarle al operador. Antes leía
 * `pagado` y `proximo_cobro_en`, mientras el cron y el corte por impago leían
 * `estado_suscripcion` y `proxima_factura`: dos respuestas posibles a la misma
 * pregunta. Ahora es una sola. */

describe("isOrgBillingDue", () => {
  it("una cuenta al día y sin factura cerca no aparece", () => {
    expect(isOrgBillingDue(org())).toBe(false);
  });

  it("pago pendiente aparece", () => {
    expect(isOrgBillingDue(org({ status: "pending_payment" }))).toBe(true);
  });

  it("dada de baja aparece: hay que ir a recuperarla", () => {
    expect(isOrgBillingDue(org({ status: "expired" }))).toBe(true);
  });

  it("una factura dentro de los 3 días aparece", () => {
    expect(isOrgBillingDue(org({ nextInvoice: aDias(2) }))).toBe(true);
  });

  it("una factura lejana todavía no", () => {
    expect(isOrgBillingDue(org({ nextInvoice: aDias(10) }))).toBe(false);
  });

  it("una factura vencida aparece", () => {
    expect(isOrgBillingDue(org({ nextInvoice: aDias(-5) }))).toBe(true);
  });

  it("el mes gratis por terminar aparece", () => {
    expect(isOrgBillingDue(org({ freeMonthUntil: aDias(1) }))).toBe(true);
  });

  it("una cuenta pausada no se cobra", () => {
    expect(
      isOrgBillingDue(org({ activo: false, status: "pending_payment" })),
    ).toBe(false);
  });

  it("el plan gratis nunca aparece", () => {
    expect(
      isOrgBillingDue(org({ plan: "gratis", status: "pending_payment" })),
    ).toBe(false);
  });

  it("en prueba, sin factura cerca, no molesta", () => {
    expect(isOrgBillingDue(org({ status: "trial", nextInvoice: aDias(20) }))).toBe(
      false,
    );
  });

  it("en prueba, con la primera factura cerca, sí", () => {
    expect(isOrgBillingDue(org({ status: "trial", nextInvoice: aDias(2) }))).toBe(
      true,
    );
  });
});

describe("billingReason", () => {
  it("la baja se nombra explícitamente", () => {
    expect(billingReason(org({ status: "expired" }))).toMatch(/baja/i);
  });

  it("el pago pendiente dice hace cuánto vencía", () => {
    expect(
      billingReason(org({ status: "pending_payment", nextInvoice: aDias(-3) })),
    ).toMatch(/3 días/);
  });

  it("el pago pendiente sin fecha igual se explica", () => {
    expect(billingReason(org({ status: "pending_payment" }))).toBe(
      "Pago pendiente",
    );
  });

  it("la cortesía manda sobre la fecha de factura", () => {
    const r = billingReason(org({ freeMonthUntil: aDias(2), nextInvoice: aDias(2) }));
    expect(r).toMatch(/mes gratis/i);
  });

  it("distingue vencido, hoy y futuro", () => {
    expect(billingReason(org({ nextInvoice: aDias(-1) }))).toMatch(/Venció/);
    expect(billingReason(org({ nextInvoice: aDias(0) }))).toMatch(/hoy/);
    expect(billingReason(org({ nextInvoice: aDias(2) }))).toMatch(/2 días/);
  });

  it("un solo día va en singular", () => {
    expect(billingReason(org({ nextInvoice: aDias(1) }))).toMatch(/1 día$/);
  });

  it("sin nada que decir, pide revisar", () => {
    expect(billingReason(org())).toBe("Revisar cobro");
  });
});
