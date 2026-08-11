import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

describe("High — Upstash rate limit fail-open", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    process.env = { ...envBackup };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.VERCEL_ENV;
    delete process.env.RATE_LIMIT_REQUIRE_UPSTASH;
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.unstubAllGlobals();
  });

  it("en local sin Upstash sigue usando memoria (permite)", async () => {
    const { sharedRateLimit, requiresDistributedRateLimit } = await import(
      "@/lib/security/rateLimitShared"
    );
    expect(requiresDistributedRateLimit()).toBe(false);
    const r = await sharedRateLimit("test:local", 5, 60_000);
    expect(r.ok).toBe(true);
  });

  it("en Vercel production sin Upstash no corta el servicio (memoria)", async () => {
    process.env.VERCEL_ENV = "production";
    const { sharedRateLimit, requiresDistributedRateLimit } = await import(
      "@/lib/security/rateLimitShared"
    );
    expect(requiresDistributedRateLimit()).toBe(true);
    const r = await sharedRateLimit("test:prod-missing", 5, 60_000);
    expect(r.ok).toBe(true);
  });

  it("RATE_LIMIT_REQUIRE_UPSTASH=1 sin Redis también usa memoria", async () => {
    process.env.RATE_LIMIT_REQUIRE_UPSTASH = "1";
    const { sharedRateLimit } = await import("@/lib/security/rateLimitShared");
    const r = await sharedRateLimit("test:forced", 5, 60_000);
    expect(r.ok).toBe(true);
  });

  it("en production con Upstash configurado consulta Redis", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ result: 1 }, { result: 1 }, { result: 60 }],
    });
    vi.stubGlobal("fetch", fetchMock);

    const { sharedRateLimit, distributedRateLimit } = await import(
      "@/lib/security/rateLimitShared"
    );
    expect(distributedRateLimit).toBe(true);
    const r = await sharedRateLimit("test:redis-ok", 5, 60_000);
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("en production si Redis falla cae a memoria (no tumba pedidos/push)", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    const { sharedRateLimit } = await import("@/lib/security/rateLimitShared");
    const r = await sharedRateLimit("test:redis-down", 5, 60_000);
    expect(r.ok).toBe(true);
  });

  it("en local si Redis falla cae a memoria (dev no se traba)", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    // sin VERCEL_ENV=production

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    const { sharedRateLimit } = await import("@/lib/security/rateLimitShared");
    const r = await sharedRateLimit("test:dev-fallback", 5, 60_000);
    expect(r.ok).toBe(true);
  });

  it("en production Redis responde over-limit → 429 lógico", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ result: 99 }, { result: 1 }, { result: 42 }],
      }),
    );

    const { sharedRateLimit } = await import("@/lib/security/rateLimitShared");
    const r = await sharedRateLimit("test:over", 5, 60_000);
    expect(r).toEqual({ ok: false, retryAfter: 42 });
  });
});
