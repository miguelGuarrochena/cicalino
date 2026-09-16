import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sql = readFileSync(join(root, "supabase/staff-floor-audit.sql"), "utf8");
const orden: string[] = JSON.parse(
  readFileSync(join(root, "supabase/orden.json"), "utf8"),
);
const chequeo = readFileSync(
  join(root, "supabase/chequeo-migraciones.sql"),
  "utf8",
);

describe("staff-floor-audit", () => {
  it("va después de staff-floor-guards", () => {
    expect(orden[orden.length - 1]).toBe("staff-floor-audit.sql");
    expect(orden.indexOf("staff-floor-guards.sql")).toBeLessThan(
      orden.indexOf("staff-floor-audit.sql"),
    );
  });

  it("chequeo-migraciones lo registra", () => {
    expect(chequeo).toContain(
      "('staff-floor-audit.sql', 'function', 'mesa_historial', 70)",
    );
    expect(chequeo).toContain("('staff-floor-audit.sql', 'staff-floor-guards.sql')");
  });

  it("el historial nombra a quien actuó y el mozo no edita el menú", () => {
    expect(sql).toMatch(/create or replace function public\.mesa_historial/i);
    expect(sql).toMatch(/emp\.nombre/);
    expect(sql).toMatch(/productos alta/);
    expect(sql).toMatch(/auth_gestiona_local/);
  });
});
