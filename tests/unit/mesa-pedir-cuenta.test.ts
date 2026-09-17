import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sql = readFileSync(join(root, "supabase/mesa-pedir-cuenta.sql"), "utf8");
const orden: string[] = JSON.parse(
  readFileSync(join(root, "supabase/orden.json"), "utf8"),
);
const chequeo = readFileSync(
  join(root, "supabase/chequeo-migraciones.sql"),
  "utf8",
);

describe("Pedir cuenta", () => {
  it("va después del llamado al mozo", () => {
    expect(orden.indexOf("mesa-llamado-mozo.sql")).toBeLessThan(
      orden.indexOf("mesa-pedir-cuenta.sql"),
    );
  });

  it("chequeo-migraciones lo registra", () => {
    expect(chequeo).toContain(
      "('mesa-pedir-cuenta.sql', 'function', 'pagar_como_comensal', 77)",
    );
    expect(chequeo).toContain("('mesa-pedir-cuenta.sql', 'mesa-llamado-mozo.sql')");
  });

  it("no prende el llamado: efectivo y tarjeta esperan en Cobrar", () => {
    expect(sql).toContain("return public._crear_pago_mesa");
    expect(sql).not.toContain("llamado_en");
  });
});
