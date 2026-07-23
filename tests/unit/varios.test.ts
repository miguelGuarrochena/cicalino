import { describe, it, expect } from "vitest";
import { translate } from "@/lib/i18n";
import { modeLabel } from "@/lib/store/config-store";
import { orderClosed } from "@/lib/types";

describe("translate (i18n)", () => {
  it("resuelve claves anidadas en ES", () => {
    expect(translate("es", "panel.titulo")).toBe("Pedidos de hoy");
  });
  it("interpola {n}", () => {
    expect(translate("es", "panel.activos", { n: 3 })).toBe("3 activos");
  });
  it("cae a la clave cruda si no existe", () => {
    expect(translate("es", "no.existe.nada")).toBe("no.existe.nada");
  });
  it("soporta inglés", () => {
    expect(translate("en", "nav.pedidos")).toBe("Orders");
  });
});

describe("modeLabel", () => {
  it("mapea cada modo a su etiqueta", () => {
    expect(modeLabel("mesa")).toBe("Mesa");
    expect(modeLabel("pedido")).toBe("Pedido");
    expect(modeLabel("nombre")).toBe("Cliente");
  });
});

describe("orderClosed", () => {
  it("cerrado = retirado o cancelado", () => {
    expect(orderClosed("retirado")).toBe(true);
    expect(orderClosed("cancelado")).toBe(true);
  });
  it("abierto en el resto", () => {
    expect(orderClosed("creado")).toBe(false);
    expect(orderClosed("en_preparacion")).toBe(false);
    expect(orderClosed("listo")).toBe(false);
  });
});
