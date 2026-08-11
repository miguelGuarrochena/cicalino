/**
 * Smoke estructural de rutas API críticas (sin pegarle a la red).
 * Complementa tests/integration/security-grants.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Integration-ish — API auth surface", () => {
  it("cron/cobros exige CRON_SECRET y ownership token del lock", () => {
    const src = read("src/app/api/cron/cobros/route.ts");
    expect(src).toContain("CRON_SECRET");
    expect(src).toContain("Authorization");
    expect(src).toContain("timingSafeEqual");
    expect(src).toContain("tomar_cron_lock");
    expect(src).toContain("p_token: lockToken");
    expect(src).toContain('reason: "not-configured"');
  });

  it("API cliente p/e usan sharedRateLimit + service admin", () => {
    for (const rel of [
      "src/app/api/p/[token]/route.ts",
      "src/app/api/e/[token]/route.ts",
    ]) {
      const src = read(rel);
      expect(src).toContain("sharedRateLimit");
      expect(src).toContain("createAdminSupabase");
      expect(src).toContain("clientIp");
    }
  });

  it("push/subscribe valida qr_expira_en", () => {
    const src = read("src/app/api/push/subscribe/route.ts");
    expect(src).toContain("qr_expira_en");
    expect(src).toContain("sharedRateLimit");
    expect(src).toMatch(/expired|expir/i);
  });

  it("push/notify no es público sin auth de panel", () => {
    const src = read("src/app/api/push/notify/route.ts");
    /* Debe atarse a sesión/pedido del panel, no a un token QR libre. */
    expect(src).toMatch(/createServerSupabase|getUser|auth/i);
  });
});
