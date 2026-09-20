import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tieneCookieDeSesion } from "@/lib/security/session-cookie";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/* El dueño abría el navegador y caía en la landing todas las veces: tenía que
 * tocar "Entrar" para llegar al panel, aunque la sesión siguiera viva. */
describe("La home cuando ya hay sesión", () => {
  it("reconoce la cookie de Supabase, entera o partida en pedazos", () => {
    expect(tieneCookieDeSesion(["sb-abcdefgh-auth-token"])).toBe(true);
    expect(
      tieneCookieDeSesion(["sb-abcdefgh-auth-token.0", "sb-abcdefgh-auth-token.1"]),
    ).toBe(true);
  });

  it("no confunde la cookie del login a medio hacer ni las del comensal", () => {
    expect(tieneCookieDeSesion(["sb-abcdefgh-auth-token-code-verifier"])).toBe(false);
    expect(tieneCookieDeSesion(["cicalino-tema", "cicalino_mesa:algo"])).toBe(false);
    expect(tieneCookieDeSesion([])).toBe(false);
  });

  it("el middleware manda la home al panel sin llamar a Supabase Auth", () => {
    const src = read("src/middleware.ts");
    expect(src).toContain('path === "/" &&');
    expect(src).toContain('!req.nextUrl.searchParams.has("web")');
    expect(src).toContain("tieneCookieDeSesion(");
    /* El redirect tiene que quedar antes del corte de rutas públicas: después
     * de ese return, la home ya salió. */
    expect(src.indexOf("tieneCookieDeSesion(req.cookies")).toBeLessThan(
      src.indexOf("if (!protegido && !esLogin) return seguir();"),
    );
  });

  it("el panel deja un camino a la landing", () => {
    expect(read("src/components/panel/PanelMenu.tsx")).toContain('href="/?web=1"');
  });
});
