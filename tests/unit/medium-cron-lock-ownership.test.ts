import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const fix = readFileSync(join(root, "supabase/security-fixes-12.sql"), "utf8");
const cron = readFileSync(
  join(root, "src/app/api/cron/cobros/route.ts"),
  "utf8",
);
const chequeo = readFileSync(
  join(root, "supabase/chequeo-cron-lock.sql"),
  "utf8",
);

describe("Low — cron lock ownership + TTL cap", () => {
  it("security-fixes-12 agrega token y redefine tomar/soltar", () => {
    expect(fix).toMatch(/add column if not exists token/i);
    expect(fix).toMatch(/drop function if exists public\.tomar_cron_lock/i);
    expect(fix).toMatch(/drop function if exists public\.soltar_cron_lock\(text\)/i);
    expect(fix).toMatch(
      /create or replace function public\.tomar_cron_lock[\s\S]*returns text/i,
    );
    expect(fix).toMatch(
      /create or replace function public\.soltar_cron_lock\s*\(\s*p_nombre text,\s*p_token text\s*\)/i,
    );
  });

  it("clampa p_segundos a [1, 3600]", () => {
    expect(fix).toMatch(/least\(coalesce\(p_segundos,\s*300\),\s*3600\)/);
    expect(fix).toMatch(/greatest\(1,/);
  });

  it("soltar exige match de token", () => {
    expect(fix).toMatch(/and token = btrim\(p_token\)/);
  });

  it("solo service_role tiene execute", () => {
    expect(fix).toMatch(/from public, anon, authenticated/i);
    expect(fix).toMatch(
      /grant execute on function public\.tomar_cron_lock[\s\S]*to service_role/i,
    );
    expect(fix).toMatch(
      /grant execute on function public\.soltar_cron_lock\(text, text\)[\s\S]*to service_role/i,
    );
  });

  it("el cron usa lockToken al soltar", () => {
    expect(cron).toContain("lockToken");
    expect(cron).toContain("p_token: lockToken");
    expect(cron).toMatch(/if\s*\(\s*!lockToken\s*\)/);
  });

  it("chequeo verifica firma soltar(text, text) y columna token", () => {
    expect(chequeo).toContain("soltar_cron_lock(text, text)");
    expect(chequeo).toContain("tiene_token");
    expect(chequeo).toContain("sin_soltar_sin_token");
  });

  it("chequeo-migraciones registra security-fixes-12", () => {
    const mig = readFileSync(
      join(root, "supabase/chequeo-migraciones.sql"),
      "utf8",
    );
    expect(mig).toContain(
      "('security-fixes-12.sql', 'column', 'cron_locks.token', 47)",
    );
    expect(mig).toContain(
      "('security-fixes-12.sql', 'cron-lock.sql, security-fixes-06.sql')",
    );
  });
});
