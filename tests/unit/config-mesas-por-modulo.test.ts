import { describe, it, expect } from "vitest";
import { needsTableCount } from "@/lib/modules";
import type { ModuleFlags } from "@/lib/modules";

const mods = (pedidos: boolean, espera: boolean, pagos: boolean): ModuleFlags => ({
  pedidos,
  espera,
  pagos,
});

/* Quién necesita saber cuántas mesas tiene el local.
 *
 * La sección se llama "Mesas" y eso hacía pensar que era de Recepción y Pagos.
 * Pedidos también la usa: cuando identifica los pedidos por número de mesa,
 * necesita saber hasta qué número acepta. */
describe("Cantidad de mesas: quién la necesita", () => {
  it("solo Pedidos con número de Cicalino: no la necesita", () => {
    expect(needsTableCount(mods(true, false, false), "pedido")).toBe(false);
  });

  it("solo Pedidos con identificador: tampoco", () => {
    expect(needsTableCount(mods(true, false, false), "nombre")).toBe(false);
  });

  it("solo Pedidos en modo mesa: sí, y es el caso que se olvidaba", () => {
    expect(needsTableCount(mods(true, false, false), "mesa")).toBe(true);
  });

  it("Recepción y Pagos la necesitan con cualquier modo", () => {
    for (const modo of ["pedido", "nombre", "mesa"]) {
      expect(needsTableCount(mods(false, true, false), modo), `espera/${modo}`).toBe(true);
      expect(needsTableCount(mods(false, false, true), modo), `pagos/${modo}`).toBe(true);
    }
  });

  it("Pedidos junto a Recepción o Pagos: la comparten, no se duplica", () => {
    expect(needsTableCount(mods(true, true, false), "pedido")).toBe(true);
    expect(needsTableCount(mods(true, false, true), "pedido")).toBe(true);
    expect(needsTableCount(mods(true, true, true), "mesa")).toBe(true);
  });

  it("un local sin módulos no la necesita, esté en el modo que esté", () => {
    for (const modo of ["pedido", "nombre", "mesa"]) {
      expect(needsTableCount(mods(false, false, false), modo), modo).toBe(false);
    }
  });
});
