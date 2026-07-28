import { describe, it, expect } from "vitest";
import {
  sumarCicloCobro,
  orgCobroPendiente,
  motivoCobro,
} from "@/lib/billing";

describe("sumarCicloCobro", () => {
  it("suma un mes en plan mensual", () => {
    const d = sumarCicloCobro("mensual", new Date("2026-01-15T12:00:00Z"));
    expect(d?.toISOString().slice(0, 7)).toBe("2026-02");
  });
  it("suma un año en plan anual", () => {
    const d = sumarCicloCobro("anual", new Date("2026-01-15T12:00:00Z"));
    expect(d?.getFullYear()).toBe(2027);
  });
  it("gratis no tiene ciclo", () => {
    expect(sumarCicloCobro("gratis")).toBeNull();
  });
});

describe("orgCobroPendiente", () => {
  const base = {
    activo: true,
    pagado: true,
    plan: "mensual" as const,
    mesGratisHasta: null,
    proximoCobroEn: null,
  };

  it("impago activo requiere atención", () => {
    expect(orgCobroPendiente({ ...base, pagado: false })).toBe(true);
  });

  it("pagado sin fecha no alerta", () => {
    expect(orgCobroPendiente(base)).toBe(false);
  });

  it("vencido alerta", () => {
    const hace = new Date();
    hace.setDate(hace.getDate() - 3);
    expect(
      orgCobroPendiente({ ...base, proximoCobroEn: hace.toISOString() }),
    ).toBe(true);
    expect(
      motivoCobro({ ...base, proximoCobroEn: hace.toISOString() }),
    ).toMatch(/Venció/);
  });
});
