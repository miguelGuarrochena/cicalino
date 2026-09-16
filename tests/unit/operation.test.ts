import { describe, it, expect } from "vitest";
import {
  fallbackPath,
  hasAnyOperationalModule,
  moduleForPath,
  navLinkActive,
  operationalNavLinks,
  pathAllowedForModules,
} from "@/lib/operation";

const todos = { pedidos: true, espera: true, pagos: true };
const sinPagos = { pedidos: true, espera: true, pagos: false };
const soloPagos = { pedidos: false, espera: false, pagos: true };
const nada = { pedidos: false, espera: false, pagos: false };

describe("operation — nav and module redirects", () => {
  it("moduleForPath no confunde /panel/config con pedidos", () => {
    expect(moduleForPath("/panel")).toBe("pedidos");
    expect(moduleForPath("/panel/espera")).toBe("espera");
    expect(moduleForPath("/panel/mesas")).toBe("pagos");
    expect(moduleForPath("/panel/mesas/qr")).toBe("pagos");
    expect(moduleForPath("/panel/config")).toBeNull();
    expect(moduleForPath("/panel/config/metricas")).toBeNull();
    expect(moduleForPath("/panel/metrics")).toBeNull();
    expect(moduleForPath("/panel/ayuda")).toBeNull();
  });

  it("la barra nombra el módulo de cobros Pagos, no Mesas, y no incluye métricas", () => {
    expect(operationalNavLinks("admin", todos).map((l) => l.key)).toEqual([
      "nav.pedidos",
      "nav.espera",
      "nav.pagos",
      "nav.config",
    ]);
  });

  it("al cambiar a una sucursal sin pagos, Pagos no es un destino", () => {
    expect(pathAllowedForModules("/panel/mesas", sinPagos)).toBe(false);
    expect(fallbackPath("/panel/mesas", sinPagos)).toBe("/panel");
    expect(fallbackPath("/panel/mesas/qr", sinPagos)).toBe("/panel");
    expect(
      operationalNavLinks("admin", sinPagos).map((l) => l.href),
    ).toEqual(["/panel", "/panel/espera", "/panel/config"]);
  });

  it("un empleado no ve Configuración y sí ve los módulos contratados", () => {
    expect(
      operationalNavLinks("empleado", todos).map((l) => l.href),
    ).toEqual(["/panel", "/panel/espera", "/panel/mesas"]);
  });

  it("métricas no es un ítem operativo", () => {
    expect(
      operationalNavLinks("admin", todos).some((l) => l.href.includes("metrics")),
    ).toBe(false);
    expect(navLinkActive("/panel/config", "/panel/config/metricas")).toBe(true);
  });

  it("sin ningún módulo operativo no redirige en loop", () => {
    expect(hasAnyOperationalModule(nada)).toBe(false);
    expect(fallbackPath("/panel", nada)).toBeNull();
    expect(fallbackPath("/panel/mesas", soloPagos)).toBeNull();
  });

  it("Pedidos redirige al home de la sucursal si no está contratado", () => {
    expect(fallbackPath("/panel", soloPagos)).toBe("/panel/mesas");
    expect(fallbackPath("/panel/espera", soloPagos)).toBe("/panel/mesas");
  });
});
