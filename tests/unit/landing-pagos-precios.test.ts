import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COMBO_PACKS, PACK_PRICES, SOLO_PACKS } from "@/lib/pricing";

const root = process.cwd();
const landing = readFileSync(join(root, "src/components/landing/SplitBillSection.tsx"), "utf8");
const catalog = readFileSync(join(root, "src/components/landing/PackCatalog.tsx"), "utf8");

describe("Landing — Pagos divididos y precios", () => {
  it("explica el flujo del cliente y lo que ve el local", () => {
    expect(landing).toContain("home.pagos.ladoCliente");
    expect(landing).toContain("home.pagos.ladoLocal");
    expect(landing).toContain("home.pagos.cliente.${k}");
    expect(landing).toContain('"suyo"');
    expect(landing).toContain('"iguales"');
    expect(landing).toContain('"porcentaje"');
    expect(landing).toContain("home.pagos.local.${k}");
    expect(landing).toContain("home.pagos.cierra");
  });

  it("el catálogo lista los tres módulos y los cuatro combos, con precios de billing", () => {
    expect(catalog).toContain("SOLO_PACKS");
    expect(catalog).toContain("COMBO_PACKS");
    expect(catalog).toContain("PACK_PRICES");
    expect(SOLO_PACKS).toEqual(["pedidos", "espera", "pagos"]);
    expect(COMBO_PACKS).toEqual(["pack", "espera_pagos", "pedidos_pagos", "completo"]);
    expect(PACK_PRICES.pedidos).toBe(20_000);
    expect(PACK_PRICES.espera).toBe(10_000);
    expect(PACK_PRICES.pagos).toBe(15_000);
    expect(PACK_PRICES.pack).toBe(25_000);
    expect(PACK_PRICES.espera_pagos).toBe(22_000);
    expect(PACK_PRICES.pedidos_pagos).toBe(30_000);
    expect(PACK_PRICES.completo).toBe(35_000);
  });
});
