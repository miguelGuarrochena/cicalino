import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const orden: string[] = JSON.parse(read("supabase/orden.json"));
const chequeo = read("supabase/chequeo-migraciones.sql");
const sql = read("supabase/mesas-historial.sql");
const tables = read("src/lib/data/tables.ts");

describe("Historial de mesas cerradas — RPC propia", () => {
  it("va después de split-payments, sin tocar mesas_cuentas", () => {
    expect(orden.indexOf("split-payments.sql")).toBeLessThan(
      orden.indexOf("mesas-historial.sql"),
    );
    expect(orden.indexOf("liberar-mesas-jornada.sql")).toBeLessThan(
      orden.indexOf("mesas-historial.sql"),
    );
    expect(sql).not.toMatch(/create or replace function public\.mesas_cuentas/i);
  });

  it("chequeo-migraciones lo registra", () => {
    expect(chequeo).toContain(
      "('mesas-historial.sql', 'function', 'mesas_cierres', 82)",
    );
    expect(chequeo).toContain(
      "('mesas-historial.sql', 'function', 'mesa_cuenta', 82)",
    );
    expect(chequeo).toContain(
      "('mesas-historial.sql', 'index', 'idx_mesa_sesiones_cierre', 82)",
    );
    expect(chequeo).toContain(
      "('mesas-historial.sql', 'split-payments.sql, liberar-mesas-jornada.sql')",
    );
  });

  it("el panel llama mesas_cierres con los mismos nombres que Postgres", () => {
    const firma = sql.match(
      /create or replace function public\.mesas_cierres\(\s*([\s\S]*?)\)\s*returns/i,
    );
    expect(firma).toBeTruthy();
    const params = [...(firma?.[1].matchAll(/\b(p_\w+)\b/g) ?? [])].map(
      (m) => m[1],
    );
    expect(params).toEqual([
      "p_local",
      "p_desde",
      "p_hasta",
      "p_estado",
      "p_busqueda",
      "p_limite",
      "p_offset",
    ]);

    const llamada = tables.match(
      /supabase\.rpc\("mesas_cierres", \{([\s\S]*?)\}\)/,
    );
    expect(llamada).toBeTruthy();
    const keys = [...(llamada?.[1].matchAll(/\b(p_\w+)\s*:/g) ?? [])].map(
      (m) => m[1],
    );
    expect(keys.sort()).toEqual([...params].sort());
  });

  it("el detalle va por mesa_cuenta, de a una y de solo lectura", () => {
    expect(sql).toMatch(
      /create or replace function public\.mesa_cuenta\(p_sesion uuid\)/,
    );
    expect(tables).toContain('supabase.rpc("mesa_cuenta", { p_sesion: sessionId })');
    expect(sql).toContain("return public._cuenta_json(p_sesion)");
    expect(sql).not.toMatch(/update public\./i);
  });

  it("authenticated lee, anon no", () => {
    expect(sql).toMatch(
      /revoke all on function public\.mesas_cierres\([^)]+\)\s*\n?\s*from public, anon/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.mesas_cierres\([^)]+\)\s*\n?\s*to authenticated/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.mesa_cuenta\(uuid\) from public, anon/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.mesa_cuenta\(uuid\) to authenticated/i,
    );
  });
});
