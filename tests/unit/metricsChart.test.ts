import { describe, it, expect } from "vitest";
import {
  ejes,
  minutos,
  pico,
  porcentaje,
  tramos,
  TRAMOS,
  type Bucket,
} from "@/lib/metricsChart";

const b = (k: number, n: number): Bucket => ({ k, n });

describe("minutos", () => {
  it("formatea con un decimal", () => {
    expect(minutos(3.14159)).toBe("3.1 min");
    expect(minutos(0)).toBe("0.0 min");
  });

  it("sin dato muestra raya, no cero", () => {
    expect(minutos(null)).toBe("—");
    expect(minutos(undefined)).toBe("—");
  });
});

describe("porcentaje", () => {
  it("redondea al entero", () => {
    expect(porcentaje(1, 3)).toBe("33%");
    expect(porcentaje(2, 3)).toBe("67%");
    expect(porcentaje(5, 5)).toBe("100%");
  });

  it("sin total muestra raya en vez de dividir por cero", () => {
    expect(porcentaje(0, 0)).toBe("—");
  });
});

describe("pico", () => {
  it("devuelve la etiqueta del bucket más alto", () => {
    expect(pico(["8h", "9h", "10h"], [2, 9, 4])).toBe("9h");
  });

  it("ante un empate se queda con el primero", () => {
    expect(pico(["Lun", "Mar"], [5, 5])).toBe("Lun");
  });

  it("si no hubo movimiento no inventa un pico", () => {
    expect(pico(["8h", "9h"], [0, 0])).toBe("—");
    expect(pico([], [])).toBe("—");
  });
});

describe("tramos", () => {
  it("son los cuatro tramos, en orden, con el porcentaje sobre el total", () => {
    const r = tramos([b(0, 5), b(1, 3), b(2, 1), b(3, 1)]);
    expect(r.map((x) => x.rango)).toEqual(TRAMOS);
    expect(r.map((x) => x.n)).toEqual([5, 3, 1, 1]);
    expect(r.map((x) => x.pct)).toEqual([50, 30, 10, 10]);
  });

  it("un tramo que la base no devolvió cuenta cero, no se saltea", () => {
    const r = tramos([b(0, 1), b(3, 1)]);
    expect(r).toHaveLength(4);
    expect(r[1]).toEqual({ rango: "5-10", n: 0, pct: 0 });
  });

  it("sin nada terminado devuelve vacío, no cuatro ceros", () => {
    expect(tramos([])).toEqual([]);
    expect(tramos([b(0, 0), b(1, 0), b(2, 0), b(3, 0)])).toEqual([]);
  });

  it("ignora índices que no son tramos", () => {
    const r = tramos([b(0, 2), b(9, 100)]);
    expect(r.map((x) => x.n)).toEqual([2, 0, 0, 0]);
    expect(r[0].pct).toBe(100);
  });
});

describe("ejes: día (por hora)", () => {
  const inicio = new Date(2026, 7, 7);

  it("cubre de 8 a 20 aunque no haya datos", () => {
    const { labels, valores } = ejes([], "dia", inicio);
    expect(labels[0]).toBe("8h");
    expect(labels.at(-1)).toBe("20h");
    expect(valores.every((v) => v === 0)).toBe(true);
  });

  it("se estira para incluir horas con movimiento fuera de la franja", () => {
    const { labels } = ejes([b(6, 3), b(23, 1)], "dia", inicio);
    expect(labels[0]).toBe("6h");
    expect(labels.at(-1)).toBe("23h");
  });

  it("pone las cantidades en la hora que corresponde", () => {
    const { labels, valores } = ejes([b(9, 7)], "dia", inicio);
    expect(valores[labels.indexOf("9h")]).toBe(7);
    expect(valores[labels.indexOf("10h")]).toBe(0);
  });

  it("una hora con cero no estira el eje", () => {
    const { labels } = ejes([b(3, 0)], "dia", inicio);
    expect(labels[0]).toBe("8h");
  });
});

describe("ejes: semana", () => {
  // Un lunes, para que el primer día del eje sea previsible.
  const lunes = new Date(2026, 7, 3);

  it("son siete días arrancando en el inicio", () => {
    const { labels, valores } = ejes([], "semana", lunes);
    expect(labels).toHaveLength(7);
    expect(valores).toHaveLength(7);
    expect(labels[0]).toBe("Lun");
    expect(labels[6]).toBe("Dom");
  });

  it("el índice del bucket es el offset en días", () => {
    const { valores } = ejes([b(0, 4), b(6, 9)], "semana", lunes);
    expect(valores[0]).toBe(4);
    expect(valores[6]).toBe(9);
    expect(valores[3]).toBe(0);
  });
});

describe("ejes: mes", () => {
  const inicio = new Date(2026, 7, 7);

  it("son cuatro semanas fijas", () => {
    const { labels } = ejes([], "mes", inicio);
    expect(labels).toEqual(["Sem 1", "Sem 2", "Sem 3", "Sem 4"]);
  });

  it("mapea cada bucket a su semana", () => {
    const { valores } = ejes([b(0, 10), b(3, 2)], "mes", inicio);
    expect(valores).toEqual([10, 0, 0, 2]);
  });
});

describe("ejes: año", () => {
  it("son doce meses arrancando en el mes del inicio", () => {
    const { labels, valores } = ejes([], "ano", new Date(2025, 8, 1));
    expect(labels).toHaveLength(12);
    expect(valores).toHaveLength(12);
    expect(labels[0]).toBe("S"); // septiembre
    expect(labels[4]).toBe("E"); // enero, cruzando de año
  });

  it("mapea el offset en meses", () => {
    const { valores } = ejes([b(0, 5), b(11, 8)], "ano", new Date(2025, 8, 1));
    expect(valores[0]).toBe(5);
    expect(valores[11]).toBe(8);
  });
});

describe("ejes: buckets vacíos", () => {
  it("todos los períodos devuelven ejes usables sin datos", () => {
    const inicio = new Date(2026, 7, 7);
    for (const p of ["dia", "semana", "mes", "ano"] as const) {
      const { labels, valores } = ejes([], p, inicio);
      expect(labels.length).toBeGreaterThan(0);
      expect(labels).toHaveLength(valores.length);
      expect(valores.every((v) => v === 0)).toBe(true);
    }
  });
});
