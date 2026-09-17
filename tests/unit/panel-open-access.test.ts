import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Panel — acceso sin login", () => {
  it("el middleware no redirige /panel a /login", () => {
    const src = read("src/middleware.ts");
    expect(src).not.toMatch(/protegido && !user/);
    expect(src).toMatch(/path\.startsWith\("\/panel"\)/);
    expect(src).toContain('if (adminProtegido && !user)');
    expect(src).toContain("if (!adminProtegido && !esLogin) return seguir()");
  });

  it("configuración no pide la contraseña del dueño", () => {
    const gate = read("src/components/panel/AdminGate.tsx");
    expect(gate).not.toContain("verifyPasswordDueño");
    expect(gate).not.toContain("adminDesbloqueado");
    expect(gate).toContain("NoAccess");
  });

  it("Entrar de la landing y el marketing va al panel", () => {
    expect(read("src/components/landing/LandingHeader.tsx")).toContain('href="/panel"');
    expect(read("src/app/faq/page.tsx")).toContain('href="/panel"');
    expect(read("src/app/pricing/page.tsx")).toContain('href="/panel"');
  });
});
