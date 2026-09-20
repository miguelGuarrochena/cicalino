import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/* Qué listas se paginan y cuáles no, con el motivo escrito.
 *
 * La pregunta que originó esto fue "¿en toda la web se paginan los listados?".
 * La respuesta no es "todas": una lista acotada por algo del mundo real —las
 * mesas del salón— no tiene por qué cortarse. Lo que sí tiene que pasar es que
 * la decisión esté tomada a propósito en cada una. */
describe("Listados: paginación donde la lista crece", () => {
  it("todas las listas que crecen usan el mismo componente", () => {
    const pagina = [
      "src/app/(app)/panel/pedidos/page.tsx",
      "src/app/(app)/panel/espera/page.tsx",
      "src/components/panel/espera/ColaEspera.tsx",
      "src/components/panel/EmployeeList.tsx",
      "src/components/panel/TimeClock.tsx",
      "src/app/(app)/panel/pagos/historial/page.tsx",
      "src/components/admin/SubscriptionsPanel.tsx",
    ];
    for (const rel of pagina) {
      expect(read(rel), rel).toContain("@/components/ui/Pagination");
    }
  });

  it("el historial dejó de tener su propio par de botones", () => {
    const historial = read("src/app/(app)/panel/pagos/historial/page.tsx");
    expect(historial).toContain("<Pagination");
    /* La página la resuelve el servidor y va 0-based contra el offset; el
     * componente cuenta desde 1. */
    expect(historial).toContain("page={pagina + 1}");
    expect(historial).toContain("onChange={(p) => setPagina(p - 1)}");
    expect(historial).not.toContain('{t("paginacion.prev")}');
    expect(historial).not.toContain('{t("paginacion.next")}');
  });

  it("la lista de clientes del admin se pagina y vuelve a la página 1 al filtrar", () => {
    const subs = read("src/components/admin/SubscriptionsPanel.tsx");
    expect(subs).toContain("slicePage(filas, page, PAGE_SIZE)");
    expect(subs).toContain("pageItems.map");
    expect(subs).toContain("const claveConsulta = `${filtro}|${q}`");
    expect(subs).toContain("setPage(1)");
    /* Los contadores del encabezado son sobre lo filtrado, no sobre la página
     * que se ve: si no, "3 atrasados" cambiaría al pasar de página. */
    expect(subs).toContain("filas.filter((f) => f.vencido).length");
    expect(subs).toContain("total={filas.length}");
  });

  it("las colas del admin se filtran en la consulta, no en el navegador", () => {
    const acciones = read("src/lib/actions/superadmin.ts");
    const sucursales = read("src/lib/actions/branchRequest.ts");
    expect(acciones).toContain('.eq("estado", "nueva")');
    expect(sucursales).toContain('.eq("estado", "nueva")');
    /* Y el panel no vuelve a filtrar por estado: la regla vive en un lugar. */
    const panel = read("src/components/admin/SolicitudesPanel.tsx");
    expect(panel).not.toContain('status === "nueva"');
  });

  it("las listas acotadas por el mundo real se cargan enteras, a propósito", () => {
    /* El salón: una baldosa por mesa. Paginar el plano del salón sería
     * esconder mesas que el mozo tiene enfrente. */
    const mesas = read("src/app/(app)/panel/pagos/page.tsx");
    const qr = read("src/app/(app)/panel/pagos/qr/page.tsx");
    for (const src of [mesas, qr]) {
      expect(src).not.toContain("@/components/ui/Pagination");
    }
    /* La carta: no se pagina porque ya viene cortada por categoría y tiene
     * buscador, y porque editando precios querés la categoría entera junta. */
    const menu = read("src/components/panel/menu/MenuWorkspace.tsx");
    expect(menu).not.toContain("@/components/ui/Pagination");
    expect(menu).toContain("setQuery");
    expect(menu).toContain("setSelected");
  });
});
