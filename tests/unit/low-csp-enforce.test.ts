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
  });

  /* El nonce depende de la ruta: antes iba en todas, y eso era justamente lo
   * que hacía imposible activar la CSP sin romper las páginas estáticas. */
  it("el nonce va en las rutas que lo pueden usar", async () => {
    const { buildCsp } = await import("@/lib/security/csp");
    expect(buildCsp("n1", true, "/p/abc")).toContain("nonce-n1");
    expect(buildCsp("n1", true, "/")).not.toContain("nonce-n1");
  });
});

/* La CSP se arma distinta según la ruta.
 *
 * El nonce solo sirve donde Next lo puede estampar en el HTML, o sea en las
 * páginas que se renderizan por request. Las estáticas se generan en el build,
 * sin nonce, y activar la CSP con nonce las dejaría sin JavaScript.
 *
 * Estos tests fijan esa distinción: si alguien agrega el nonce a todas las
 * rutas "para que sea más seguro", rompe la landing y acá salta. */
describe("Low — CSP por ruta (nonce solo donde llega)", () => {
  const dinamicas = [
    "/p/2f1c9b8a-0000-4000-8000-000000000000",
    "/e/2f1c9b8a-0000-4000-8000-000000000000",
    "/aceptar/abcdef0123456789",
    "/admin",
    "/admin/cliente/2f1c9b8a-0000-4000-8000-000000000000",
  ];
  const estaticas = [
    "/",
    "/login",
    "/pricing",
    "/faq",
    "/probar",
    "/terms",
    "/privacy",
    "/panel",
    "/panel/config",
    "/panel/espera",
  ];

  it("las rutas dinámicas llevan nonce y NO unsafe-inline en script-src", async () => {
    const { buildCsp } = await import("@/lib/security/csp");
    for (const ruta of dinamicas) {
      const csp = buildCsp("n1", true, ruta);
      const scriptSrc = csp
        .split("; ")
        .find((d) => d.startsWith("script-src"))!;
      expect(scriptSrc, ruta).toContain("'nonce-n1'");
      expect(scriptSrc, ruta).not.toContain("unsafe-inline");
    }
  });

  it("las rutas estáticas NO llevan nonce", async () => {
    const { buildCsp } = await import("@/lib/security/csp");
    for (const ruta of estaticas) {
      const scriptSrc = buildCsp("n1", true, ruta)
        .split("; ")
        .find((d) => d.startsWith("script-src"))!;
      expect(scriptSrc, ruta).not.toContain("nonce");
      expect(scriptSrc, ruta).toContain("'unsafe-inline'");
    }
  });

  it("nunca conviven nonce y unsafe-inline (el navegador ignoraría el segundo)", async () => {
    const { buildCsp } = await import("@/lib/security/csp");
    for (const ruta of [...dinamicas, ...estaticas]) {
      const scriptSrc = buildCsp("n1", true, ruta)
        .split("; ")
        .find((d) => d.startsWith("script-src"))!;
      const tieneNonce = scriptSrc.includes("nonce");
      const tieneUnsafe = scriptSrc.includes("unsafe-inline");
      expect(tieneNonce && tieneUnsafe, ruta).toBe(false);
      expect(tieneNonce || tieneUnsafe, ruta).toBe(true);
    }
  });

  it("el resto de las defensas se aplica en todas las rutas por igual", async () => {
    const { buildCsp } = await import("@/lib/security/csp");
    for (const ruta of [...dinamicas, ...estaticas]) {
      const csp = buildCsp("n1", true, ruta);
      for (const d of [
        "frame-ancestors 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "default-src 'self'",
      ]) {
        expect(csp, `${ruta} → ${d}`).toContain(d);
      }
    }
  });

  it("admiteNonce no se deja confundir por rutas parecidas", async () => {
    const { admiteNonce } = await import("@/lib/security/csp");
    expect(admiteNonce("/p/abc")).toBe(true);
    expect(admiteNonce("/admin")).toBe(true);
    expect(admiteNonce("/admin/cliente/1")).toBe(true);
    /* Estas empiezan parecido pero son estáticas. */
    expect(admiteNonce("/pricing")).toBe(false);
    expect(admiteNonce("/privacy")).toBe(false);
    expect(admiteNonce("/probar")).toBe(false);
    expect(admiteNonce("/panel")).toBe(false);
    expect(admiteNonce("/panel/espera")).toBe(false);
    expect(admiteNonce("/")).toBe(false);
  });
});
