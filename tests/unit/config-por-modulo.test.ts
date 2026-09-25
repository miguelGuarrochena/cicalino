import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const page = read("src/app/(app)/panel/config/page.tsx");
const nav = read("src/components/panel/config/ConfigNav.tsx");

/* Cada opción de Configuración se muestra según los módulos que de verdad la
 * usan, no según en qué sección de la pantalla quedó dibujada.
 *
 * El caso que originó esto: "cómo identificás los pedidos" vivía en Avanzado,
 * que se muestra siempre, así que un local con solo Recepción o solo Pagos
 * podía cambiar una configuración que no usa en ninguna pantalla. */
describe("Configuración: visible según lo contratado", () => {
  it("la identificación de pedidos es de Pedidos y de nadie más", () => {
    expect(page).toContain('{c.moduloPedidos && (');
    expect(page).toContain('acc("pedidos")');
    expect(nav).toContain('key: "config.tab.pedidos", show: moduloPedidos');
    /* Y ya no cuelga de Avanzado, que se muestra a todos. */
    const avanzado = page.slice(page.indexOf('acc("avanzado")'));
    expect(avanzado).not.toContain("config.seccionId");
    expect(avanzado).not.toContain("modes.map");
  });

  it("quién necesita la cantidad de mesas se pregunta en un solo lugar", () => {
    /* Es el caso contrario al anterior: una opción que parece de un módulo y
     * la usan tres. La condición estaba escrita tres veces —sección, pestaña
     * y validación del guardado—; ahora las tres llaman al mismo predicado,
     * que tiene su propio test con los escenarios. */
    expect(page).toContain("needsTableCount(");
    expect(page).toContain("{pideMesas && (");
    expect(page).toContain("if (pideMesas && (!tableCount || tableCount < 1))");
    expect(nav).toContain("needsTableCount(");
    /* Y ya no queda ninguna copia suelta de la regla. */
    expect(page).not.toContain('c.moduloEspera || c.moduloPagos || modo === "mesa"');
    expect(nav).not.toContain('visibles.espera || visibles.pagos || modo === "mesa"');
  });

  it("los tres modos se ofrecen a cualquiera que tenga Pedidos", () => {
    /* Identificar por mesa es una forma válida de numerar aunque el local no
     * tenga Recepción ni Pagos: elegirla es justamente lo que hace aparecer
     * la configuración de cantidad de mesas. */
    expect(page).toContain('{ id: "pedido"');
    expect(page).toContain('{ id: "nombre"');
    expect(page).toContain('{ id: "mesa"');
    expect(page).not.toContain("hayMesas");
  });

  it("lo general no depende de ningún módulo", () => {
    /* Identidad, personal y avanzado (corte de jornada y días cerrados) los
     * usa cualquier local, tenga lo que tenga contratado. */
    for (const id of ["identidad", "empleados", "avanzado"]) {
      const antes = page.slice(0, page.indexOf(`acc("${id}")`));
      const ultimaLinea = antes.slice(antes.lastIndexOf("\n", antes.length - 2));
      expect(ultimaLinea, id).not.toContain("modulo");
    }
  });

  it("las secciones de un módulo siguen colgando de su módulo", () => {
    /* Cobros es de Pagos, y también de Pedidos cuando el cliente paga desde
     * la mesa (modalidad Mesa): los dos cobran con los mismos métodos. */
    expect(page).toContain("{cobrosVisibles && isRealBranchId(branchId) && (");
    /* Elegir Mostrador QR (que cuelga de Pedidos) también la muestra: sin
     * métodos de pago no se puede activar. */
    expect(page).toContain(
      "usesTableMenu(modulos, c.pedidosModalidad, c.pedidosMesa) || qrMostradorBorrador;",
    );
    expect(page).toContain("const qrMostradorBorrador = pedidosMostradorQr(modulos, pedidosModalidad);");
    expect(page).toContain("{c.moduloEspera && (");
    expect(page).toContain("{c.moduloPedidos && c.moduloEspera && (");
  });
});
