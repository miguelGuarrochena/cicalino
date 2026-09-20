import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const page = read("src/app/(app)/panel/config/page.tsx");
const branch = read("src/lib/data/branch.ts");
const schema = read("src/lib/db/schema.ts");

/* El modo de identificación es del local, no del módulo.
 *
 * Un local que eligió "mesa" y después deja de tener Pedidos contratado tiene
 * que seguir en "mesa" en la base: la configuración no se muestra mientras el
 * módulo no esté, pero vuelve tal cual cuando lo recontrata. "Número de
 * Cicalino" es el default del que nunca configuró nada, no un valor al que se
 * regrese cada vez que se activa el módulo. */
describe("modo_identificacion: se conserva salvo cambio manual", () => {
  it("el default del que nunca configuró nada lo pone la base", () => {
    expect(schema).toContain('identificationModeEnum("modo_identificacion")');
    expect(schema).toContain('.default("pedido")');
    /* El alta de sucursal no lo escribe, así que toma ese default. */
    expect(read("src/lib/actions/superadmin.ts")).not.toContain("modo_identificacion");
  });

  it("se escribe en un solo lugar y solo con lo que se guardó", () => {
    const escrituras = [
      "src/lib/data/branch.ts",
      "src/app/(app)/panel/config/page.tsx",
      "src/lib/actions/superadmin.ts",
      "src/lib/data/customer-order.ts",
    ].filter((rel) => read(rel).includes("modo_identificacion:"));
    expect(escrituras).toEqual(["src/lib/data/branch.ts"]);
    expect(branch).toContain("modo_identificacion: v.data.modo");
  });

  it("solo un cambio manual mete el modo en el borrador", () => {
    /* Lo que el usuario no tocó sigue al store, que viene de la base. Con el
     * módulo apagado la sección no se dibuja, así que nadie puede tocarlo y
     * el guardado reescribe el mismo valor que ya estaba. */
    expect(page).toContain("const modo = draft.modo ?? c.modo;");
    expect(page).toContain('editar("modo", m.id)');
  });

  it("no se guarda nada antes de que la sucursal hidrate", () => {
    /* Si no, el guardado mandaría el valor que el store traía de antes: el
     * default, o el modo de la sucursal anterior al cambiar de sucursal. */
    expect(page).toContain("if (!c.branchConfigReady) return;");
    expect(page).toContain("disabled={saving || !dirty || !c.branchConfigReady}");
  });

  it("al leer, el fallback es solo de lectura y no vuelve a la base", () => {
    expect(branch).toContain('modo: (data.modo_identificacion as IdentificationMode) ?? "pedido"');
  });
});
