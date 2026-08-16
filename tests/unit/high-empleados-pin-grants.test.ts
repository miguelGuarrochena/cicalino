import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sql = (f: string) => readFileSync(join(root, "supabase", f), "utf8");

const fix = sql("security-fixes-17.sql");
const historico = sql("security-fixes-03.sql");

/* Columnas de `empleados` que el panel sí necesita. `tiene_pin` es GENERATED
 * ALWAYS: va en el SELECT pero Postgres rechaza escribirla, así que no puede
 * aparecer en el INSERT ni en el UPDATE. */
const LEGIBLES = [
  "id",
  "local_id",
  "nombre",
  "rol",
  "activo",
  "created_at",
  "tiene_pin",
  "usuario_id",
];
const ESCRIBIBLES = LEGIBLES.filter((c) => c !== "tiene_pin");

const bloque = (verbo: "select" | "insert" | "update"): string => {
  const re = new RegExp(`grant ${verbo} \\(([^)]*)\\)`, "i");
  return re.exec(fix)?.[1] ?? "";
};

describe("High — empleados.pin_hash sin grants de cliente", () => {
  it("saca el privilegio de TABLA, que es lo que hacía inútil al REVOKE por columna", () => {
    expect(fix).toMatch(
      /revoke select, insert, update on public\.empleados\s+from anon, authenticated/i,
    );
  });

  it("re-otorga columna por columna sin pin ni pin_hash", () => {
    for (const verbo of ["select", "insert", "update"] as const) {
      const cols = bloque(verbo);
      expect(cols, `grant ${verbo} existe`).not.toBe("");
      expect(cols, `${verbo} no incluye pin_hash`).not.toMatch(/\bpin_hash\b/);
      expect(cols, `${verbo} no incluye pin`).not.toMatch(/\bpin\b/);
    }
  });

  it("el panel conserva las columnas que usa", () => {
    for (const c of LEGIBLES) {
      expect(bloque("select"), `select ${c}`).toContain(c);
    }
    for (const c of ESCRIBIBLES) {
      expect(bloque("insert"), `insert ${c}`).toContain(c);
      expect(bloque("update"), `update ${c}`).toContain(c);
    }
  });

  it("no intenta escribir tiene_pin, que es GENERATED ALWAYS", () => {
    expect(bloque("insert")).not.toContain("tiene_pin");
    expect(bloque("update")).not.toContain("tiene_pin");
  });

  it("deja el chequeo de columnas huérfanas para no olvidarse al agregar una", () => {
    expect(fix).toContain("has_column_privilege");
    expect(fix).toContain("information_schema.columns");
  });

  it("no reescribe el histórico #03: ahí el revoke por columna sigue como estaba", () => {
    expect(historico).toMatch(
      /revoke select \(pin, pin_hash\) on public\.empleados from anon, authenticated/i,
    );
    expect(historico).not.toMatch(
      /revoke select, insert, update on public\.empleados/i,
    );
  });

  it("chequeo-migraciones y orden.json registran #17 después de #03", () => {
    const chequeo = sql("chequeo-migraciones.sql");
    const orden = JSON.parse(
      readFileSync(join(root, "supabase/orden.json"), "utf8"),
    ) as string[];
    expect(chequeo).toContain(
      "('security-fixes-17.sql', 'security-fixes-03.sql')",
    );
    expect(orden).toContain("security-fixes-17.sql");
    expect(orden.indexOf("security-fixes-17.sql")).toBeGreaterThan(
      orden.indexOf("security-fixes-03.sql"),
    );
  });
});
