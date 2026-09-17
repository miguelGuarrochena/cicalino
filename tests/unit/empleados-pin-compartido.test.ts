import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sql = readFileSync(
  join(root, "supabase/empleados-pin-compartido.sql"),
  "utf8",
);
const orden: string[] = JSON.parse(
  readFileSync(join(root, "supabase/orden.json"), "utf8"),
);
const chequeo = readFileSync(
  join(root, "supabase/chequeo-migraciones.sql"),
  "utf8",
);

describe("empleados-pin-compartido", () => {
  it("va después de staff-roles y queda en el chequeo", () => {
    expect(orden.indexOf("staff-roles.sql")).toBeLessThan(
      orden.indexOf("empleados-pin-compartido.sql"),
    );
    expect(chequeo).toContain(
      "('empleados-pin-compartido.sql', 'function', 'set_empleado_pin', 76)",
    );
    expect(chequeo).toContain(
      "('empleados-pin-compartido.sql', 'staff-roles.sql')",
    );
  });

  it("deja guardar el mismo PIN en dos personas y sigue pidiendo 4 dígitos", () => {
    expect(sql).toContain("set_empleado_pin");
    expect(sql).toContain("auth_gestiona_local");
    expect(sql).toContain("El PIN tiene que ser de 4 dígitos");
    expect(sql).not.toContain("ya está en uso");
    expect(sql).not.toContain("e.pin_hash = extensions.crypt");
  });
});
