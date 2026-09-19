import { describe, it, expect } from "vitest";
import {
  clampCantidad,
  itemsCarrito,
  itemsParaEnviar,
  lineasDelCarrito,
  totalCarrito,
  MAX_POR_PRODUCTO,
} from "@/lib/cart";
import type { GuestMenuProduct } from "@/components/customer/table/TableGuestApp";

const prod = (id: string, price: number): GuestMenuProduct => ({
  id,
  name: id,
  description: null,
  category: "Cat",
  price,
});

const menu = new Map<string, GuestMenuProduct>([
  ["empanada", prod("empanada", 900)],
  ["provoleta", prod("provoleta", 7200)],
  ["flan", prod("flan", 4500)],
]);

describe("cantidades", () => {
  it("no baja de cero ni sube del tope", () => {
    expect(clampCantidad(-3)).toBe(0);
    expect(clampCantidad(0)).toBe(0);
    expect(clampCantidad(7)).toBe(7);
    expect(clampCantidad(999)).toBe(MAX_POR_PRODUCTO);
  });

  it("no deja cantidades rotas", () => {
    /* El `+` y el `−` mandan enteros, pero la cuenta que los produce sale de
       un estado que podría llegar sucio. Una cantidad de 2.5 no existe. */
    expect(clampCantidad(2.7)).toBe(2);
    expect(clampCantidad(Number.NaN)).toBe(0);
  });
});

describe("líneas del pedido", () => {
  it("respeta el orden en que se fueron agregando", () => {
    /* Quien está corrigiendo una cantidad no quiere que la lista le baile. */
    const lineas = lineasDelCarrito({ flan: 1, empanada: 12 }, menu);
    expect(lineas.map((l) => l.producto.id)).toEqual(["flan", "empanada"]);
  });

  it("un producto que bajó a cero se va de la lista", () => {
    const lineas = lineasDelCarrito({ empanada: 0, flan: 2 }, menu);
    expect(lineas.map((l) => l.producto.id)).toEqual(["flan"]);
  });

  it("vuelve a su lugar original si sube de nuevo", () => {
    /* La clave nunca se borra del objeto, así que conserva su posición. */
    const lineas = lineasDelCarrito({ empanada: 0, flan: 2, provoleta: 1 }, menu);
    expect(lineas.map((l) => l.producto.id)).toEqual(["flan", "provoleta"]);
    const despues = lineasDelCarrito({ empanada: 3, flan: 2, provoleta: 1 }, menu);
    expect(despues.map((l) => l.producto.id)).toEqual(["empanada", "flan", "provoleta"]);
  });

  it("ignora lo que ya no está en la carta", () => {
    /* El local puede desactivar un producto mientras la mesa lo mira. Mandarlo
       sería pedir algo que no existe. */
    const lineas = lineasDelCarrito({ fantasma: 2, flan: 1 }, menu);
    expect(lineas.map((l) => l.producto.id)).toEqual(["flan"]);
  });

  it("el subtotal es el precio de la carta por la cantidad", () => {
    const lineas = lineasDelCarrito({ empanada: 12 }, menu);
    expect(lineas[0].subtotal).toBe(10800);
  });
});

describe("totales del pedido", () => {
  const lineas = lineasDelCarrito({ empanada: 12, provoleta: 1, flan: 2 }, menu);

  it("el total es la suma de los subtotales", () => {
    expect(totalCarrito(lineas)).toBe(12 * 900 + 7200 + 2 * 4500);
  });

  it("cuenta unidades y no renglones", () => {
    /* Doce empanadas y una provoleta son trece cosas para la cocina. */
    expect(itemsCarrito(lineas)).toBe(15);
    expect(lineas).toHaveLength(3);
  });

  it("un pedido vacío es cero y no rompe", () => {
    expect(totalCarrito([])).toBe(0);
    expect(itemsCarrito([])).toBe(0);
  });
});

describe("lo que viaja al servidor", () => {
  it("manda id y cantidad, nada más", () => {
    const lineas = lineasDelCarrito({ flan: 2 }, menu);
    expect(itemsParaEnviar(lineas)).toEqual([{ productId: "flan", quantity: 2 }]);
  });

  it("no manda ceros ni productos que ya no están", () => {
    const lineas = lineasDelCarrito({ empanada: 0, fantasma: 5, flan: 1 }, menu);
    expect(itemsParaEnviar(lineas)).toEqual([{ productId: "flan", quantity: 1 }]);
  });
});
