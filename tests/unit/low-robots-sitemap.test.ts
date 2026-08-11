import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("Low — robots + sitemap", () => {
  it("robots.ts bloquea panel/admin/api/QR y apunta al sitemap", () => {
    const src = readFileSync(join(root, "src/app/robots.ts"), "utf8");
    expect(src).toContain('disallow: [');
    expect(src).toContain('"/panel"');
    expect(src).toContain('"/admin"');
    expect(src).toContain('"/api/"');
    expect(src).toContain('"/aceptar/"');
    expect(src).toContain('"/p/"');
    expect(src).toContain('"/e/"');
    expect(src).toContain("sitemap.xml");
    expect(src).toContain("appBaseUrl");
  });

  it("sitemap.ts lista solo rutas de marketing", () => {
    const src = readFileSync(join(root, "src/app/sitemap.ts"), "utf8");
    expect(src).toContain('"/pricing"');
    expect(src).toContain('"/probar"');
    expect(src).toContain('"/faq"');
    expect(src).toContain('"/privacy"');
    expect(src).toContain('"/terms"');
    expect(src).not.toContain('"/panel"');
    expect(src).not.toContain('"/admin"');
  });
});
