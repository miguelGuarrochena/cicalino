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
  it("moduleForPath no confunde el hub ni /panel/config con pedidos", () => {
    expect(moduleForPath("/panel")).toBeNull();
    expect(moduleForPath("/panel/pedidos")).toBe("pedidos");
    expect(moduleForPath("/panel/espera")).toBe("espera");
    expect(moduleForPath("/panel/pagos")).toBe("pagos");
    expect(moduleForPath("/panel/pagos/qr")).toBe("pagos");
    expect(moduleForPath("/panel/config")).toBeNull();
    expect(moduleForPath("/panel/config/metricas")).toBeNull();
    expect(moduleForPath("/panel/metrics")).toBeNull();
    expect(moduleForPath("/panel/ayuda")).toBeNull();
  });

  it("la barra es Pedidos, Recepción y Pagos: sin métricas", () => {
    /* Las tres tareas del día. */
    expect(operationalNavLinks("admin", todos).map((l) => l.key)).toEqual([
      "nav.pedidos",
      "nav.espera",
      "nav.pagos",
    ]);
    expect(operationalNavLinks("admin", todos).map((l) => l.href)).toEqual([
      "/panel/pedidos",
      "/panel/espera",
      "/panel/pagos",
    ]);
  });

  it("al cambiar a una sucursal sin pagos, Pagos no es un destino", () => {
    expect(pathAllowedForModules("/panel/pagos", sinPagos)).toBe(false);
    expect(fallbackPath("/panel/pagos", sinPagos)).toBe("/panel");
    expect(fallbackPath("/panel/pagos/qr", sinPagos)).toBe("/panel");
    expect(
      operationalNavLinks("admin", sinPagos).map((l) => l.href),
    ).toEqual(["/panel/pedidos", "/panel/espera"]);
  });

  it("un empleado no ve Configuración y sí ve los módulos contratados", () => {
    expect(
      operationalNavLinks("empleado", todos).map((l) => l.href),
    ).toEqual(["/panel/pedidos", "/panel/espera", "/panel/pagos"]);
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
    expect(fallbackPath("/panel/pagos", soloPagos)).toBeNull();
  });

  it("Pedidos redirige al home de la sucursal si no está contratado", () => {
    expect(fallbackPath("/panel/pedidos", soloPagos)).toBe("/panel/pagos");
    expect(fallbackPath("/panel/espera", soloPagos)).toBe("/panel/pagos");
    expect(fallbackPath("/panel", soloPagos)).toBeNull();
  });
});
