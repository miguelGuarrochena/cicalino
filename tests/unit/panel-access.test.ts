import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Panel — acceso", () => {
  it("el middleware manda /panel y /admin sin sesión a /login", () => {
    const src = read("src/middleware.ts");
    expect(src).toContain('const protegido = path.startsWith("/panel") || path.startsWith("/admin");');
    expect(src).toContain("if (!protegido && !esLogin) return seguir();");
    expect(src).toContain("if (protegido && !user)");
  });

  it("el login no tiene un atajo al panel", () => {
    expect(read("src/app/login/page.tsx")).not.toContain('href="/panel"');
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
