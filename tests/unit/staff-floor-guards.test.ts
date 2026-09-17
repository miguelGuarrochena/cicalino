import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sql = readFileSync(join(root, "supabase/staff-floor-guards.sql"), "utf8");
const orden: string[] = JSON.parse(
  readFileSync(join(root, "supabase/orden.json"), "utf8"),
);
const chequeo = readFileSync(
  join(root, "supabase/chequeo-migraciones.sql"),
  "utf8",
);

describe("staff-floor-guards", () => {
  it("va después de staff-roles, split-payments y mesa-qr-activo", () => {
    expect(orden.indexOf("staff-roles.sql")).toBeLessThan(
      orden.indexOf("staff-floor-guards.sql"),
    );
    expect(orden.indexOf("split-payments.sql")).toBeLessThan(
      orden.indexOf("staff-floor-guards.sql"),
    );
    expect(orden.indexOf("mesa-qr-activo.sql")).toBeLessThan(
      orden.indexOf("staff-floor-guards.sql"),
    );
  });

  it("chequeo-migraciones lo registra", () => {
    expect(chequeo).toContain(
      "('staff-floor-guards.sql', 'function', 'sincronizar_mesas', 69)",
    );
    expect(chequeo).toContain(
      "('staff-floor-guards.sql', 'staff-roles.sql, split-payments.sql, mesa-qr-activo.sql')",
    );
  });

  it("el mozo no cambia mesas ni anula un cobro ya cobrado", () => {
    expect(sql).toMatch(/reason',\s*'sin-permiso'/);
    expect(sql).toMatch(/reason',\s*'requiere-encargado'/);
    expect(sql).toMatch(/empleado_de_usuario/);
    expect(sql).toMatch(/auth_gestiona_local/);
  });
});
