import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const fixSql = readFileSync(
  join(root, "supabase/security-fixes-08.sql"),
  "utf8",
);
const chequeoSql = readFileSync(
  join(root, "supabase/chequeo-cola-espera.sql"),
  "utf8",
);
const apiSrc = readFileSync(
  join(root, "src/app/api/e/[token]/route.ts"),
  "utf8",
);
const historico = readFileSync(join(root, "supabase/cola-espera.sql"), "utf8");

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
};

describe("Medium — cola_de_espera solo service_role (security-fixes-08)", () => {
  it("revoca EXECUTE a public, anon y authenticated", () => {
    expect(fixSql).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.cola_de_espera\s*\(\s*text\s*\)/i,
    );
    expect(fixSql.toLowerCase()).toContain("from public, anon, authenticated");
  });

  it("otorga EXECUTE a service_role", () => {
    expect(fixSql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.cola_de_espera\s*\(\s*text\s*\)\s+to\s+service_role/i,
    );
  });

  it("el chequeo verifica los cuatro roles", () => {
    expect(chequeoSql).toContain("anon_puede");
    expect(chequeoSql).toContain("authenticated_puede");
    expect(chequeoSql).toContain("public_puede");
    expect(chequeoSql).toContain("service_role_puede");
  });

  it("el API /api/e usa admin client + rate limit + cola_de_espera", () => {
    expect(apiSrc).toContain("createAdminSupabase");
    expect(apiSrc).toContain("sharedRateLimit");
    expect(apiSrc).toMatch(/\.rpc\(\s*["']cola_de_espera["']/);
  });

  it("ningún client/action/hook llama cola_de_espera directo", () => {
    for (const base of [
      "src/lib/actions",
      "src/lib/data",
      "src/lib/hooks",
      "src/components",
    ]) {
      for (const file of walk(join(root, base))) {
        expect(
          readFileSync(file, "utf8").includes("cola_de_espera"),
          `${file} no debería llamar cola_de_espera`,
        ).toBe(false);
      }
    }
  });

  it("el histórico grant a authenticated queda anulado por el fix aditivo", () => {
    expect(historico.toLowerCase()).toContain(
      "grant execute on function public.cola_de_espera(text) to authenticated",
    );
    expect(fixSql.toLowerCase()).toContain("revoke execute");
  });

  it("chequeo-migraciones registra security-fixes-08", () => {
    const chequeo = readFileSync(
      join(root, "supabase/chequeo-migraciones.sql"),
      "utf8",
    );
    expect(chequeo).toContain("('security-fixes-08.sql', 'cola-espera.sql')");
  });
});
