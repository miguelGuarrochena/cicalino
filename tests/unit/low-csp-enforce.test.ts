import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Low — CSP enforce (opt-in)", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...envBackup };
    delete process.env.CSP_ENFORCE;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("sin CSP_ENFORCE=1 queda Report-Only (false), incluso en production", async () => {
    process.env.VERCEL_ENV = "production";
    const { cspEnforce } = await import("@/lib/security/csp");
    expect(cspEnforce()).toBe(false);
  });

  it("CSP_ENFORCE=1 activa enforce", async () => {
    process.env.CSP_ENFORCE = "1";
    const { cspEnforce } = await import("@/lib/security/csp");
    expect(cspEnforce()).toBe(true);
  });

  it("buildCsp añade upgrade-insecure-requests solo con enforce", async () => {
    const { buildCsp } = await import("@/lib/security/csp");
    expect(buildCsp("n1", false)).not.toContain("upgrade-insecure-requests");
    expect(buildCsp("n1", true)).toContain("upgrade-insecure-requests");
    expect(buildCsp("n1", true)).toContain("nonce-n1");
  });
});
