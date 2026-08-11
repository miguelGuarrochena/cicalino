import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const orden: string[] = JSON.parse(
  readFileSync(join(root, "supabase/orden.json"), "utf8"),
);
const chequeo = readFileSync(
  join(root, "supabase/chequeo-migraciones.sql"),
  "utf8",
);

describe("High — SQL migration tracker", () => {
  it("orden.json lista todos los .sql operativos exactamente una vez", () => {
    const onDisk = readdirSync(join(root, "supabase"))
      .filter((f) => f.endsWith(".sql") && !f.startsWith("chequeo"))
      .sort();
    expect([...orden].sort()).toEqual(onDisk);
    expect(new Set(orden).size).toBe(orden.length);
  });

  it("cada archivo de orden existe", () => {
    for (const f of orden) {
      expect(existsSync(join(root, "supabase", f)), f).toBe(true);
    }
  });

  it("respeta las dependencias de chequeo-migraciones requisitos", () => {
    const idx = chequeo.indexOf("requisitos (archivo, necesita)");
    const block = chequeo.slice(idx, chequeo.indexOf("\n),", idx));
    const deps = new Map<string, string[]>();
    for (const m of block.matchAll(
      /\(\s*'([^']+\.sql)'\s*,\s*'([^']*)'\s*\)/g,
    )) {
      const need = m[2].trim();
      deps.set(
        m[1],
        need === "—" || need === "-" || need === ""
          ? []
          : need.split(",").map((s) => s.trim()),
      );
    }
    const pos = new Map(orden.map((f, i) => [f, i]));
    for (const [f, ds] of deps) {
      expect(pos.has(f), `${f} en requisitos`).toBe(true);
      for (const d of ds) {
        expect(pos.has(d), `dep ${d} de ${f}`).toBe(true);
        expect(
          (pos.get(d) as number) < (pos.get(f) as number),
          `${d} debe ir antes que ${f}`,
        ).toBe(true);
      }
    }
  });

  it("security-fixes-13 crea cicalino_schema_migrations", () => {
    const fix = readFileSync(
      join(root, "supabase/security-fixes-13.sql"),
      "utf8",
    );
    expect(fix).toMatch(/create table if not exists public\.cicalino_schema_migrations/i);
    expect(fix).toMatch(/enable row level security/i);
  });

  it("db-migrate.mjs y package scripts existen", () => {
    expect(existsSync(join(root, "scripts/db-migrate.mjs"))).toBe(true);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.scripts["db:sql"]).toContain("db-migrate.mjs");
    expect(pkg.scripts["db:sql:baseline"]).toContain("--baseline");
    expect(pkg.scripts["db:migrate"]).toContain("drizzle-kit migrate");
  });

  it("chequeo-migraciones registra security-fixes-13", () => {
    expect(chequeo).toContain(
      "('security-fixes-13.sql', 'table', 'cicalino_schema_migrations', 48)",
    );
    expect(chequeo).toContain("('security-fixes-13.sql', '—')");
  });
});
