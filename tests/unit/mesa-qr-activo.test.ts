import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sql = readFileSync(join(root, "supabase/mesa-qr-activo.sql"), "utf8");
const orden: string[] = JSON.parse(
  readFileSync(join(root, "supabase/orden.json"), "utf8"),
);
const chequeo = readFileSync(
  join(root, "supabase/chequeo-migraciones.sql"),
  "utf8",
);

describe("mesa-qr-activo", () => {
  it("está después de split-payments en orden.json", () => {
    expect(orden.indexOf("split-payments.sql")).toBeLessThan(
      orden.indexOf("mesa-qr-activo.sql"),
    );
    expect(orden.indexOf("mesa-qr-activo.sql")).toBeLessThan(
      orden.indexOf("staff-floor-guards.sql"),
    );
    expect(orden.indexOf("staff-floor-guards.sql")).toBeLessThan(
      orden.indexOf("staff-floor-audit.sql"),
    );
  });

  it("chequeo-migraciones lo registra", () => {
    expect(chequeo).toContain("('mesa-qr-activo.sql', 'column', 'mesas.qr_activo', 68)");
    expect(chequeo).toContain("('mesa-qr-activo.sql', 'split-payments.sql')");
  });

  it("el scan de comensales exige qr_activo", () => {
    expect(sql).toMatch(/not v_m\.qr_activo/);
    expect(sql).toMatch(/create or replace function public\.set_mesas_qr/i);
    expect(sql).toMatch(/alter column qr_activo set default false/i);
  });

  it("regenerar vuelve a dejar el QR activo", () => {
    expect(sql).toMatch(/qr_activo = true/);
  });

  it("se puede descargar solo el QR, con marco, o una plancha", () => {
    const page = readFileSync(
      join(root, "src/app/(app)/panel/pagos/qr/page.tsx"),
      "utf8",
    );
    const sticker = readFileSync(join(root, "src/lib/qrSticker.ts"), "utf8");
    const modal = readFileSync(
      join(root, "src/components/panel/mesas/QrDownloadModal.tsx"),
      "utf8",
    );
    expect(page).toContain("QrDownloadModal");
    expect(page).toContain("sheetPng");
    expect(page).toContain("printImage");
    expect(page).toContain("InformativeQrCard");
    expect(page).toContain("PRINT_QR_OPTIONS");
    expect(page).not.toMatch(/<select[\s>]/);
    expect(sticker).toContain('kind: "solo" | "marco"');
    expect(sticker).toContain("INFORMATIVE_QR_PX");
    expect(sticker).toContain("copy.orderSteps");
    expect(sticker).toContain("copy.paySteps");
    expect(modal).toContain("descargarSoloHint");
    expect(modal).toContain("descargarMarcoHint");
    expect(modal).toContain("InformativeQrCard");
    expect(modal).toContain("aspect-[180/102]");
    expect(modal).toContain("sm:items-start");
    const solo = modal.slice(modal.indexOf('onPick("solo")'));
    expect(solo.indexOf("descargarSolo")).toBeLessThan(solo.indexOf("aspect-square"));
  });
});
