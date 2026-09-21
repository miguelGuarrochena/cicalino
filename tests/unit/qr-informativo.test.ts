import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { translate } from "@/lib/i18n";
import {
  INFORMATIVE_QR_MM,
  INFORMATIVE_QR_PX,
  informativeQrCopy,
  printAccentFor,
} from "@/lib/qrInformativo";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("QR informativo", () => {
  it("el cartel es horizontal, de mesa, y no un folleto", () => {
    expect(INFORMATIVE_QR_MM.w).toBeGreaterThan(INFORMATIVE_QR_MM.h);
    expect(INFORMATIVE_QR_PX.w).toBeGreaterThan(INFORMATIVE_QR_PX.h);
    expect(INFORMATIVE_QR_MM.w).toBe(180);
    expect(INFORMATIVE_QR_MM.h).toBe(102);
  });

  it("agrupa Pedí y Pagá, con las dos aclaraciones, sin explicar el split", () => {
    const es = informativeQrCopy((k) => translate("es", k));
    expect(es.title).toBe("Pedí y pagá desde tu mesa");
    expect(es.orderSteps).toEqual([
      "Escaneá el QR",
      "Elegí del menú",
      "Hacé tu pedido",
    ]);
    expect(es.paySteps).toEqual([
      "Escaneá nuevamente al terminar",
      "Pedí la cuenta",
      "Elegí cómo pagar",
      "Pagá",
    ]);
    expect(es.orderNote).toMatch(/propio teléfono/);
    expect(es.payNote).toMatch(/dividirla/);
    expect(es.byline).toBe("by Cicalino");
    expect(es.payNote).not.toMatch(/Mercado Pago/i);
    expect(es.payNote).not.toMatch(/porcentaje/i);
    expect(es.payNote).not.toMatch(/partes iguales/i);
  });

  it("el acento de impresión es oscuro sobre blanco", () => {
    expect(printAccentFor(null)).toBe("#1b29b0");
    expect(printAccentFor("blanco")).toBe("#1b29b0");
    expect(printAccentFor("bordo")).toBe("#7f1d1d");
    expect(printAccentFor("verde")).toBe("#14532d");
  });

  it("el QR simple no pasa por el cartel informativo", () => {
    const papel = read("src/components/panel/PrintableQr.tsx");
    const modal = read("src/components/panel/QrModal.tsx");
    const sticker = read("src/lib/qrSticker.ts");
    expect(papel).toContain("68mm");
    expect(papel).not.toContain("cartelPedi");
    expect(papel).not.toContain("InformativeQrCard");
    expect(modal).toContain("PrintableQr");
    expect(modal).not.toContain("InformativeQrCard");
    expect(sticker).toContain('kind === "solo" ? 3 : 1');
    expect(sticker).toContain("cellW = kind === \"solo\" ? 560");
  });
});
