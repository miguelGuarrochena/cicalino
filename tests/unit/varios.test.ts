import { describe, it, expect } from "vitest";
import { translate } from "@/lib/i18n";
import { etiquetaModo } from "@/lib/store/config-store";
import { pedidoCerrado } from "@/lib/types";

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

describe("etiquetaModo", () => {
  it("mapea cada modo a su etiqueta", () => {
    expect(etiquetaModo("mesa")).toBe("Mesa");
    expect(etiquetaModo("pedido")).toBe("Pedido");
    expect(etiquetaModo("nombre")).toBe("Cliente");
  });
});

describe("pedidoCerrado", () => {
  it("cerrado = retirado o cancelado", () => {
    expect(pedidoCerrado("retirado")).toBe(true);
    expect(pedidoCerrado("cancelado")).toBe(true);
  });
  it("abierto en el resto", () => {
    expect(pedidoCerrado("creado")).toBe(false);
    expect(pedidoCerrado("en_preparacion")).toBe(false);
    expect(pedidoCerrado("listo")).toBe(false);
  });
});
