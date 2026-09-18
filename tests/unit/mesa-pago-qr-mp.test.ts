import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const orden: string[] = JSON.parse(read("supabase/orden.json"));
const chequeo = read("supabase/chequeo-migraciones.sql");
const enumSql = read("supabase/mesa-pago-qr-mp-enum.sql");
const sql = read("supabase/mesa-pago-qr-mp.sql");

describe("QR de Mercado Pago — método presencial", () => {
  it("el enum va antes de usarlo, y después de split-payments", () => {
    expect(orden.indexOf("split-payments.sql")).toBeLessThan(
      orden.indexOf("mesa-pago-qr-mp-enum.sql"),
    );
    expect(orden.indexOf("mesa-pago-qr-mp-enum.sql")).toBeLessThan(
      orden.indexOf("mesa-pago-qr-mp.sql"),
    );
  });

  it("chequeo-migraciones lo registra", () => {
    expect(chequeo).toContain(
      "('mesa-pago-qr-mp-enum.sql', 'enum_value', 'metodo_pago_mesa.qr_mercado_pago', 80)",
    );
    expect(chequeo).toContain(
      "('mesa-pago-qr-mp.sql', 'column', 'local_cobros.acepta_qr_mercado_pago', 81)",
    );
    expect(chequeo).toContain("('mesa-pago-qr-mp-enum.sql', 'split-payments.sql')");
    expect(chequeo).toContain("('mesa-pago-qr-mp.sql', 'mesa-pago-qr-mp-enum.sql')");
  });

  it("agrega el valor y el flag, sin checkout ni webhook", () => {
    expect(enumSql).toMatch(/add value if not exists 'qr_mercado_pago'/i);
    expect(sql).toContain("acepta_qr_mercado_pago");
    expect(sql).toContain("v_metodo = 'qr_mercado_pago'");
    expect(sql).not.toContain("checkout/preferences");
    expect(sql).not.toContain("mp_confirmar_pago");
  });

  it("el confirmado manual sigue sin aplicar a Mercado Pago online", () => {
    expect(sql).toContain("and v_metodo <> 'mercado_pago'");
    expect(sql).not.toContain("v_metodo <> 'qr_mercado_pago'");
  });
});
