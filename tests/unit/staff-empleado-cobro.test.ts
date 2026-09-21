import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sql = readFileSync(join(root, "supabase/staff-empleado-cobro.sql"), "utf8");
const orden: string[] = JSON.parse(
  readFileSync(join(root, "supabase/orden.json"), "utf8"),
);
const chequeo = readFileSync(
  join(root, "supabase/chequeo-migraciones.sql"),
  "utf8",
);

const funcion = (nombre: string): string => {
  const i = sql.indexOf(`create or replace function public.${nombre}`);
  expect(i, `${nombre} en la migración`).toBeGreaterThan(-1);
  const j = sql.indexOf("\n$$;", i);
  return sql.slice(i, j);
};

describe("staff-empleado-cobro", () => {
  it("va después de mesa-launch-blockers y el chequeo lo registra", () => {
    expect(orden.at(-1)).toBe("staff-empleado-cobro.sql");
    expect(orden.indexOf("staff-floor-guards.sql")).toBeLessThan(
      orden.indexOf("staff-empleado-cobro.sql"),
    );
    expect(chequeo).toContain(
      "('staff-empleado-cobro.sql', 'function', '_staff_empleado_cobro', 88)",
    );
    expect(chequeo).toContain(
      "('staff-empleado-cobro.sql', 'staff-floor-guards.sql, mesa-launch-blockers.sql')",
    );
  });

  it("el mozo no atribuye un cobro a otro empleado, ni a uno inactivo", () => {
    const h = funcion("_staff_empleado_cobro");
    expect(h).toContain("auth_gestiona_local");
    expect(h).toContain("empleado_de_usuario");
    expect(h).toContain("and activo");
    expect(h).toContain("empleado-invalido");
    expect(h).toMatch(/p_empleado is distinct from v_self/);
    expect(sql).toMatch(/revoke all on function public\._staff_empleado_cobro/);
  });

  it("registrar y confirmar usan el helper, no el exists de sucursal a secas", () => {
    expect(funcion("registrar_pago_personal")).toContain("_staff_empleado_cobro");
    expect(funcion("confirmar_pago_mesa")).toContain("_staff_empleado_cobro");
    expect(funcion("registrar_pago_personal")).not.toMatch(
      /not exists \(\s*select 1 from public\.empleados where id = p_empleado and local_id/,
    );
    expect(funcion("confirmar_pago_mesa")).not.toMatch(
      /not exists \(\s*select 1 from public\.empleados where id = p_empleado and local_id/,
    );
  });
});
