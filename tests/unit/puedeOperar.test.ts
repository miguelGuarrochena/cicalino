import { describe, it, expect } from "vitest";
import { puedeOperar, type MySubscription } from "@/lib/data/subscription";

const sub = (over: Partial<MySubscription> = {}): MySubscription => ({
  status: "active",
  plan: "mensual",
  activo: true,
  altaEn: null,
  pruebaInicio: null,
  pruebaFin: null,
  proximaFactura: null,
  ultimoPagoEn: null,
  ...over,
});

/* Mirrors `local_operativo` in supabase/corte-por-impago.sql, which is what
 * actually blocks the writes. This copy only decides whether the panel shows
 * the blocked screen, so the two have to agree: if this one is looser the shop
 * sees a working panel where every button fails, and if it's stricter we lock
 * out someone the database would have let through. */

describe("puedeOperar", () => {
  it("una cuenta al día opera", () => {
    expect(puedeOperar(sub())).toBe(true);
  });

  it("durante la prueba opera", () => {
    expect(puedeOperar(sub({ status: "trial" }))).toBe(true);
  });

  it("con el pago pendiente todavía opera: son los días de gracia", () => {
    expect(puedeOperar(sub({ status: "pending_payment" }))).toBe(true);
  });

  it("vencida no opera", () => {
    expect(puedeOperar(sub({ status: "expired" }))).toBe(false);
  });

  it("pausada a mano no opera, aunque la suscripción figure al día", () => {
    expect(puedeOperar(sub({ activo: false }))).toBe(false);
  });

  it("pausada y vencida a la vez tampoco", () => {
    expect(puedeOperar(sub({ activo: false, status: "expired" }))).toBe(false);
  });

  it("el estado paused no corta por sí solo: lo que corta es activo", () => {
    // 'paused' lo saltea el cron pero nadie lo escribe hoy. Si algún día se
    // usa, el corte tiene que seguir viniendo de `activo`, que es lo que
    // toca el panel de Superadmin.
    expect(puedeOperar(sub({ status: "paused" }))).toBe(true);
    expect(puedeOperar(sub({ status: "paused", activo: false }))).toBe(false);
  });
});
