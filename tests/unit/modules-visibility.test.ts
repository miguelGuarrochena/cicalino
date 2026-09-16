import { describe, it, expect } from "vitest";
import {
  visibleModules,
  onlyModule,
  panelHomePath,
} from "@/lib/modules";

describe("modules — solo espera / dispositivo", () => {
  it("sucursal solo-espera ignora localStorage 'pedidos'", () => {
    expect(
      visibleModules({ pedidos: false, espera: true, pagos: false }, "pedidos"),
    ).toEqual({ pedidos: false, espera: true, pagos: false });
  });

  it("sucursal solo-pedidos ignora localStorage 'espera'", () => {
    expect(
      visibleModules({ pedidos: true, espera: false, pagos: false }, "espera"),
    ).toEqual({ pedidos: true, espera: false, pagos: false });
  });

  it("con ambos módulos respeta el dispositivo", () => {
    expect(
      visibleModules({ pedidos: true, espera: true, pagos: false }, "espera"),
    ).toEqual({ pedidos: false, espera: true, pagos: false });
    expect(
      visibleModules({ pedidos: true, espera: true, pagos: false }, "pedidos"),
    ).toEqual({ pedidos: true, espera: false, pagos: false });
    expect(
      visibleModules({ pedidos: true, espera: true, pagos: false }, "ambos"),
    ).toEqual({ pedidos: true, espera: true, pagos: false });
  });

  it("panelHomePath manda solo-espera a /panel/espera", () => {
    expect(panelHomePath({ pedidos: false, espera: true, pagos: false })).toBe(
      "/panel/espera",
    );
    expect(panelHomePath({ pedidos: true, espera: false, pagos: false })).toBe("/panel");
    expect(panelHomePath({ pedidos: true, espera: true, pagos: false })).toBe("/panel");
  });

  it("onlyModule detecta el único módulo contratado", () => {
    expect(onlyModule({ pedidos: false, espera: true, pagos: false })).toBe("espera");
    expect(onlyModule({ pedidos: true, espera: false, pagos: false })).toBe("pedidos");
    expect(onlyModule({ pedidos: true, espera: true, pagos: false })).toBeNull();
  });

  it("pagos divididos no depende del modo del dispositivo", () => {
    expect(
      visibleModules({ pedidos: true, espera: true, pagos: true }, "espera"),
    ).toEqual({ pedidos: false, espera: true, pagos: true });
    expect(
      visibleModules({ pedidos: true, espera: false, pagos: true }, "espera"),
    ).toEqual({ pedidos: true, espera: false, pagos: true });
  });

  it("una sucursal con solo pagos divididos arranca en /panel/mesas", () => {
    const soloPagos = { pedidos: false, espera: false, pagos: true };
    expect(panelHomePath(soloPagos)).toBe("/panel/mesas");
    expect(onlyModule(soloPagos)).toBe("pagos");
    expect(onlyModule({ pedidos: true, espera: false, pagos: true })).toBeNull();
  });
});
