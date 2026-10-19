import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lineLabel, notaLimpia, parseDishChoice, precioDeLinea, precioDesde } from "@/lib/dishChoice";

describe("aclaración del plato", () => {
  it("lee dos o tres opciones y descarta el resto", () => {
    expect(
      parseDishChoice({
        pregunta: "Tamaño",
        items: [
          { nombre: "Chica", precio: 8000 },
          { nombre: "Grande", precio: 11000 },
        ],
      }),
    ).toEqual({
      question: "Tamaño",
      options: [
        { name: "Chica", price: 8000 },
        { name: "Grande", price: 11000 },
      ],
    });
    expect(parseDishChoice(null)).toBeNull();
    expect(parseDishChoice({ pregunta: "Tamaño", items: [{ nombre: "Única", precio: 1 }] })).toBeNull();
  });

  it("el precio de la carta es el menor cuando las opciones no cuestan igual", () => {
    const choice = parseDishChoice({
      pregunta: "Tamaño",
      items: [
        { nombre: "Chica", precio: 8000 },
        { nombre: "Grande", precio: 11000 },
      ],
    });
    expect(precioDesde(8000, choice)).toEqual({ amount: 8000, desde: true });
    expect(precioDeLinea(8000, choice, "Grande")).toBe(11000);
    expect(precioDeLinea(8000, choice, null)).toBeNull();
    expect(precioDeLinea(900, null, null)).toBe(900);
  });

  it("limpia la aclaración sin perder las palabras", () => {
    expect(notaLimpia("  sin   cebolla  ")).toBe("sin cebolla");
    expect(notaLimpia(" \n ")).toBe("");
    expect(lineLabel("Milanesa", "Grande", "sin cebolla")).toBe("Milanesa · Grande — sin cebolla");
  });

  it("la migración guarda la opción y la nota, y las muestra en la comanda", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/plato-aclaracion.sql"), "utf8");
    expect(sql).toContain("pedido_items");
    expect(sql).toContain("add column if not exists opcion");
    expect(sql).toContain("add column if not exists nota");
    expect(sql).toContain("productos");
    expect(sql).toContain("_lineas_pedido");
    expect(sql).toContain("'opcion', i.opcion, 'nota', i.nota");
    const orden = JSON.parse(
      readFileSync(join(process.cwd(), "supabase/orden.json"), "utf8"),
    ) as string[];
    expect(orden.at(-1)).toBe("plato-aclaracion.sql");
  });
});
