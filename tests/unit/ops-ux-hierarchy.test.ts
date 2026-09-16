import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Operación — jerarquía y layout", () => {
  it("QR: una columna en mobile, dos en tablet, tres o más en desktop", () => {
    const qr = read("src/app/(app)/panel/mesas/qr/page.tsx");
    expect(qr).toContain("grid-cols-1");
    expect(qr).toContain("md:grid-cols-2");
    expect(qr).toContain("lg:grid-cols-3");
    expect(qr).not.toContain("grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4");
  });

  it("Pedidos y Espera no duplican el filtro en tarjetas y chips", () => {
    const pedidos = read("src/app/(app)/panel/page.tsx");
    const espera = read("src/app/(app)/panel/espera/page.tsx");
    expect(pedidos).not.toContain("panel.resumenActivos");
    expect(espera).not.toContain('f === "libre" ? "todas"');
  });

  it("Pagos lista mesas a ancho completo en mobile y Cobrar es el CTA de la mesa", () => {
    const mesas = read("src/app/(app)/panel/mesas/page.tsx");
    const detalle = read("src/components/panel/mesas/TableDetail.tsx");
    expect(mesas).toContain("grid-cols-1");
    expect(mesas).toContain("mesas.verMesa");
    expect(mesas).toContain("SegmentedTabs");
    expect(detalle).toContain("w-full rounded-full bg-marca");
    expect(detalle).toContain("mesas.cobrar");
  });
});
