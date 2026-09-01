import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const ficha = readFileSync(
  join(root, "src/app/admin/cliente/[id]/page.tsx"),
  "utf8",
);

/* Borrar una empresa desde la ficha del cliente la sacaba del store y dejaba
 * la página buscando un id que ya no existe: quedaba en "Cargando cliente…"
 * para siempre. Ahora vuelve al listado. */
describe("Ficha del cliente después de eliminar la empresa", () => {
  it("vuelve al listado cuando la empresa desaparece del store", () => {
    expect(ficha).toContain('router.replace("/admin")');
  });

  it("no redirige en la primera carga, mientras el store todavía no llegó", () => {
    /* Sin este flag, entrar por URL directa rebotaría al listado antes de que
     * refreshOrganizations traiga las empresas. */
    expect(ficha).toContain("existioAlgunaVez.current = true");
    expect(ficha).toMatch(
      /if \(existioAlgunaVez\.current\) router\.replace\("\/admin"\)/,
    );
  });
});
