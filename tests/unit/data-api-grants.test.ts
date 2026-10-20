import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const sinComentarios = (sql: string) => sql.replace(/--.*$/gm, "");

const grants = sinComentarios(read("supabase/data-api-grants.sql"));
const orden: string[] = JSON.parse(read("supabase/orden.json"));

type Grant = { privs: string; objetos: string[]; roles: string[] };

const parseGrants = (sql: string): Grant[] =>
  [
    ...sql.matchAll(
      /\bgrant\s+([\s\S]+?)\s+on\s+(?:table\s+|sequence\s+|function\s+)?([\s\S]+?)\s+to\s+([\w\s,]+?)\s*;/gi,
    ),
  ].map((m) => ({
    privs: m[1].toLowerCase(),
    objetos: [...m[2].matchAll(/public\.(\w+)/gi)].map((t) => t[1].toLowerCase()),
    roles: m[3].split(",").map((r) => r.trim().toLowerCase()),
  }));

const lista = parseGrants(grants);

const scriptsSupabase = readdirSync(join(root, "supabase")).filter(
  (f) => f.endsWith(".sql") && !f.startsWith("chequeo"),
);
const scriptsDrizzle = readdirSync(join(root, "drizzle"))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => `drizzle/${f}`);
const todos = [
  ...scriptsSupabase.map((f) => `supabase/${f}`),
  ...scriptsDrizzle,
].map((p) => sinComentarios(read(p)));

describe("Data API grants (cambio de Supabase 30/10/2026)", () => {
  it("corre último en orden.json y figura en requisitos", () => {
    expect(orden.at(-1)).toBe("data-api-grants.sql");
    expect(read("supabase/chequeo-migraciones.sql")).toMatch(
      /\(\s*'data-api-grants\.sql'\s*,/,
    );
  });

  it("anon no recibe ningún privilegio", () => {
    for (const g of lista) expect(g.roles, g.objetos.join()).not.toContain("anon");
    expect(grants).not.toMatch(/\bto\s+(public|anon)\b/i);
  });

  it("ningún grant nombra pin ni pin_hash", () => {
    for (const g of lista) expect(g.privs).not.toMatch(/\bpin(_hash)?\b/);
  });

  it("empleados: solo grants por columna, salvo DELETE del panel", () => {
    const emp = lista.filter((g) => g.objetos.includes("empleados"));
    expect(emp.length).toBeGreaterThan(0);
    for (const g of emp) {
      if (g.privs === "delete") {
        expect(g.roles).toEqual(["authenticated"]);
        continue;
      }
      expect(g.privs, "grant de tabla completa sobre empleados").toMatch(/\(/);
    }
    expect(
      emp.some((g) => g.roles.includes("authenticated") && /\bupdate\b/.test(g.privs)),
      "authenticated no actualiza empleados directo (usa set_empleado_pin / team.ts)",
    ).toBe(false);
  });

  it("push_subscriptions solo para service_role", () => {
    const push = lista.filter((g) => g.objetos.includes("push_subscriptions"));
    expect(push.length).toBeGreaterThan(0);
    for (const g of push) expect(g.roles).toEqual(["service_role"]);
  });

  it("tablas solo-server sin grants", () => {
    for (const t of ["cron_locks", "reserva_mesas", "cicalino_schema_migrations"]) {
      expect(lista.some((g) => g.objetos.includes(t)), t).toBe(false);
    }
  });

  it("revoca antes de otorgar", () => {
    const primerGrant = grants.search(/\bgrant\b/i);
    const ultimoRevoke = Math.max(
      ...[...grants.matchAll(/\brevoke all on table\b/gi)].map((m) => m.index ?? 0),
    );
    expect(ultimoRevoke).toBeLessThan(primerGrant);
  });

  it("toda tabla creada tiene grants explícitos en algún script", () => {
    const creadas = new Set<string>();
    for (const sql of todos) {
      for (const m of sql.matchAll(
        /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?(\w+)"?/gi,
      )) {
        creadas.add(m[1].toLowerCase());
      }
    }
    const cubiertas = new Set<string>();
    for (const sql of todos) {
      for (const m of sql.matchAll(
        /\b(?:grant|revoke)\s+[\s\S]+?\s+on\s+(?:table\s+)?((?:public\.\w+\s*,?\s*)+)\s+(?:to|from)\b/gi,
      )) {
        for (const t of m[1].matchAll(/public\.(\w+)/gi)) cubiertas.add(t[1].toLowerCase());
      }
    }
    const faltan = [...creadas].filter((t) => !cubiertas.has(t)).sort();
    expect(faltan, "tablas sin GRANT/REVOKE explícito para la Data API").toEqual([]);
  });

  it("marcar_en_preparacion_pendientes ejecutable por el cron", () => {
    expect(
      lista.some(
        (g) =>
          g.privs === "execute" &&
          g.objetos.includes("marcar_en_preparacion_pendientes") &&
          g.roles.includes("service_role"),
      ),
    ).toBe(true);
  });

  it("recarga el schema cache de PostgREST", () => {
    expect(grants).toContain("notify pgrst, 'reload schema'");
  });
});
