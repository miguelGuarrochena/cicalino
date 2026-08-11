import { describe, it, expect } from "vitest";
import {
  visibleModules,
  onlyModule,
  panelHomePath,
} from "@/lib/modules";

describe("modules — solo espera / dispositivo", () => {
  it("sucursal solo-espera ignora localStorage 'pedidos'", () => {
    expect(
      visibleModules({ pedidos: false, espera: true }, "pedidos"),
    ).toEqual({ pedidos: false, espera: true });
  });

  it("sucursal solo-pedidos ignora localStorage 'espera'", () => {
    expect(
      visibleModules({ pedidos: true, espera: false }, "espera"),
    ).toEqual({ pedidos: true, espera: false });
  });

  it("con ambos módulos respeta el dispositivo", () => {
    expect(
      visibleModules({ pedidos: true, espera: true }, "espera"),
    ).toEqual({ pedidos: false, espera: true });
    expect(
      visibleModules({ pedidos: true, espera: true }, "pedidos"),
    ).toEqual({ pedidos: true, espera: false });
    expect(
      visibleModules({ pedidos: true, espera: true }, "ambos"),
    ).toEqual({ pedidos: true, espera: true });
  });

  it("panelHomePath manda solo-espera a /panel/espera", () => {
    expect(panelHomePath({ pedidos: false, espera: true })).toBe(
      "/panel/espera",
    );
    expect(panelHomePath({ pedidos: true, espera: false })).toBe("/panel");
    expect(panelHomePath({ pedidos: true, espera: true })).toBe("/panel");
  });

  it("onlyModule detecta el único módulo contratado", () => {
    expect(onlyModule({ pedidos: false, espera: true })).toBe("espera");
    expect(onlyModule({ pedidos: true, espera: false })).toBe("pedidos");
    expect(onlyModule({ pedidos: true, espera: true })).toBeNull();
  });
});
