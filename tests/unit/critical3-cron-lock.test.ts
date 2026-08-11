import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const fixSql = readFileSync(
  join(root, "supabase/security-fixes-06.sql"),
  "utf8",
);
const chequeoSql = readFileSync(
  join(root, "supabase/chequeo-cron-lock.sql"),
  "utf8",
);
const cronSrc = readFileSync(
  join(root, "src/app/api/cron/cobros/route.ts"),
  "utf8",
);
const cronLockSql = readFileSync(join(root, "supabase/cron-lock.sql"), "utf8");
const fix05 = readFileSync(
  join(root, "supabase/security-fixes-05.sql"),
  "utf8",
);

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
};

describe("Critical #3 — tomar/soltar_cron_lock grants (security-fixes-06)", () => {
  it("revoca EXECUTE de tomar_cron_lock a public, anon y authenticated", () => {
    expect(fixSql).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.tomar_cron_lock\s*\(\s*text\s*,\s*integer\s*\)/i,
    );
    const block = fixSql.match(
      /revoke\s+execute\s+on\s+function\s+public\.tomar_cron_lock[\s\S]*?;/i,
    )?.[0] ?? "";
    expect(block.toLowerCase()).toContain("from public, anon, authenticated");
  });

  it("revoca EXECUTE de soltar_cron_lock a public, anon y authenticated", () => {
    expect(fixSql).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.soltar_cron_lock\s*\(\s*text\s*\)/i,
    );
    const block = fixSql.match(
      /revoke\s+execute\s+on\s+function\s+public\.soltar_cron_lock[\s\S]*?;/i,
    )?.[0] ?? "";
    expect(block.toLowerCase()).toContain("from public, anon, authenticated");
  });

  it("otorga EXECUTE explícitamente a service_role en ambas", () => {
    expect(fixSql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.tomar_cron_lock\s*\(\s*text\s*,\s*integer\s*\)\s+to\s+service_role/i,
    );
    expect(fixSql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.soltar_cron_lock\s*\(\s*text\s*\)\s+to\s+service_role/i,
    );
  });

  it("sigue el mismo patrón de permisos que security-fixes-05", () => {
    expect(fix05.toLowerCase()).toContain("from public, anon, authenticated");
    expect(fix05.toLowerCase()).toContain("to service_role");
    expect(fixSql.toLowerCase()).toContain("from public, anon, authenticated");
    expect(fixSql.toLowerCase()).toContain("to service_role");
  });

  it("el chequeo verifica anon/authenticated/public en false y service_role en true", () => {
    for (const col of [
      "tomar_anon",
      "tomar_authenticated",
      "tomar_public",
      "tomar_service_role",
      "soltar_anon",
      "soltar_authenticated",
      "soltar_public",
      "soltar_service_role",
    ]) {
      expect(chequeoSql).toContain(col);
    }
    expect(chequeoSql).toContain("has_function_privilege('anon'");
    expect(chequeoSql).toContain("has_function_privilege('authenticated'");
    expect(chequeoSql).toContain("has_function_privilege('public'");
    expect(chequeoSql).toContain("has_function_privilege('service_role'");
  });
});

describe("Critical #3 — lógica del lock no se altera", () => {
  it("security-fixes-06 no redefine el cuerpo de las funciones", () => {
    expect(fixSql.toLowerCase()).not.toContain("create or replace function");
    expect(fixSql.toLowerCase()).not.toContain("insert into public.cron_locks");
    expect(fixSql.toLowerCase()).not.toContain(
      "update public.cron_locks",
    );
  });

  it("cron-lock.sql conserva el lock atómico por expiración", () => {
    expect(cronLockSql).toContain("on conflict (nombre) do update");
    expect(cronLockSql).toMatch(/expira_en\s*<\s*now\(\)/);
    expect(cronLockSql).toMatch(
      /set\s+expira_en\s*=\s*now\(\)\s*-\s*interval\s+'1 second'/,
    );
  });
});

describe("Critical #3 — llamador legítimo (cron / service_role)", () => {
  it("solo el cron invoca tomar/soltar_cron_lock en el código de la app", () => {
    expect(cronSrc).toContain("tomar_cron_lock");
    expect(cronSrc).toContain("soltar_cron_lock");

    const forbiddenRoots = [
      "src/lib/actions",
      "src/lib/data",
      "src/lib/server",
      "src/components",
      "src/lib/hooks",
    ];
    for (const base of forbiddenRoots) {
      for (const file of walk(join(root, base))) {
        const src = readFileSync(file, "utf8");
        expect(
          src.includes("tomar_cron_lock") || src.includes("soltar_cron_lock"),
          `${file} no debería llamar cron lock RPCs`,
        ).toBe(false);
      }
    }
  });

  it("el cron usa createAdminSupabase (service_role), CRON_SECRET y el flujo tomar→procesar→soltar", () => {
    expect(cronSrc).toContain('from "@/lib/supabase/admin"');
    expect(cronSrc).toContain("createAdminSupabase");
    expect(cronSrc).toContain("CRON_SECRET");
    expect(cronSrc).toMatch(
      /\.rpc\(\s*["']tomar_cron_lock["']\s*,\s*\{[\s\S]*?p_nombre:\s*LOCK[\s\S]*?p_segundos:\s*LOCK_SEGUNDOS/,
    );
    expect(cronSrc).toMatch(
      /\.rpc\(\s*["']soltar_cron_lock["']\s*,\s*\{[\s\S]*?p_nombre:\s*LOCK[\s\S]*?p_token:\s*lockToken/,
    );
    expect(cronSrc).toContain("finally");
    expect(cronSrc).toContain('reason: "ya-corriendo"');
  });

  it("LOCK_SEGUNDOS sigue en 300 (comportamiento normal del lock)", () => {
    expect(cronSrc).toMatch(/LOCK_SEGUNDOS\s*=\s*300/);
    expect(cronSrc).toMatch(/LOCK\s*=\s*["']cobros["']/);
  });
});

describe("Critical #3 — chequeo-migraciones registra el fix", () => {
  it("requisitos incluye security-fixes-06.sql dependiente de cron-lock.sql", () => {
    const chequeo = readFileSync(
      join(root, "supabase/chequeo-migraciones.sql"),
      "utf8",
    );
    expect(chequeo).toContain(
      "('security-fixes-06.sql', 'cron-lock.sql')",
    );
  });
});
