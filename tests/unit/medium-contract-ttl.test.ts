import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTRACT_TOKEN_TTL_MS,
  contractTokenExpired,
} from "@/lib/contract";

const root = process.cwd();

describe("Medium — contract token TTL + rate limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("CONTRACT_TOKEN_TTL_MS es 7 días", () => {
    expect(CONTRACT_TOKEN_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("contractTokenExpired: null o inválido → vencido", () => {
    expect(contractTokenExpired(null)).toBe(true);
    expect(contractTokenExpired(undefined)).toBe(true);
    expect(contractTokenExpired("no-es-fecha")).toBe(true);
  });

  it("contractTokenExpired: fresco OK, viejo vencido", () => {
    expect(contractTokenExpired("2026-08-11T11:00:00Z")).toBe(false);
    expect(contractTokenExpired("2026-08-01T11:00:00Z")).toBe(true);
  });

  it("security-fixes-11 agrega contrato_token_creado_en", () => {
    const fix = readFileSync(
      join(root, "supabase/security-fixes-11.sql"),
      "utf8",
    );
    expect(fix).toMatch(/contrato_token_creado_en/);
    expect(fix).toMatch(/add column if not exists contrato_token_creado_en/i);
  });

  it("sendContractLinkInternal siempre renueva token + timestamp", () => {
    const src = readFileSync(
      join(root, "src/lib/server/sendContractLink.ts"),
      "utf8",
    );
    expect(src).toContain("contrato_token_creado_en");
    expect(src).toMatch(/contrato_token:\s*token/);
    expect(src).toContain("nuevoToken()");
  });

  it("get/acceptContract rate-limitean y chequean TTL", () => {
    const src = readFileSync(
      join(root, "src/lib/actions/contract.ts"),
      "utf8",
    );
    expect(src).toContain("sharedRateLimit");
    expect(src).toContain("contractTokenExpired");
    expect(src).toContain("contrato_token_creado_en");
    expect(src).toContain('rateLimitContract("get"');
    expect(src).toContain('rateLimitContract("accept"');
  });

  it("chequeo-migraciones registra security-fixes-11", () => {
    const chequeo = readFileSync(
      join(root, "supabase/chequeo-migraciones.sql"),
      "utf8",
    );
    expect(chequeo).toContain(
      "('security-fixes-11.sql', 'column', 'organizaciones.contrato_token_creado_en', 46)",
    );
    expect(chequeo).toContain(
      "('security-fixes-11.sql', 'contrato-aceptacion.sql')",
    );
  });
});
