import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const pedidos = read("src/app/(app)/panel/pedidos/page.tsx");
const datos = read("src/lib/data/orders.ts");

/* Cómo se identifica un pedido: o lo numera Cicalino, o lo escribe el local.
 * Lo escribe el local, nunca el cliente. */
describe("Alta de pedido: número de Cicalino o identificador", () => {
  it("con número de Cicalino el QR sale sin pasar por el popup", () => {
    /* `null` deja que la RPC asigne el número bajo lock, que es lo que evita
     * que dos cajas saquen el mismo. */
    expect(pedidos).toContain('if (mode === "pedido")');
    expect(pedidos).toContain("void handleCreate(null)");
  });

  it("con identificador el popup se abre sin QR y el QR sale al generar", () => {
    expect(pedidos).toContain("setCrearOpen(true)");
    expect(pedidos).toContain('t("panel.pedirNombre")');
    expect(pedidos).toContain('t("panel.crearYQr")');
    /* El QR recién aparece cuando el alta volvió con el pedido creado. */
    expect(pedidos).toContain("const ok = await handleCreate(ref);");
    expect(pedidos).toContain("qr.abrirNuevo(created)");
  });

  it("avisa si el identificador ya está en uso, pero no traba el mostrador", () => {
    expect(pedidos).toContain("findOpenOrderWithReference");
    expect(pedidos).toContain("setRefRepetida(true)");
    /* El segundo toque crea igual. */
    expect(pedidos).toContain('t("panel.refRepetidaSeguir")');
    expect(pedidos).toContain("!refRepetida");
    /* Solo en el modo identificador: repetir una mesa es normal. */
    expect(pedidos).toContain('mode === "nombre" && !refRepetida');
  });

  it("repetido es lo que sigue abierto hoy, no lo que ya se entregó", () => {
    expect(datos).toContain('.in("estado", ["creado", "en_preparacion", "listo"])');
    expect(datos).toContain('.gte("creado_en", startOfBusinessDay())');
    /* Si la consulta falla, el alta sigue: no se inventa un aviso. */
    expect(datos).toContain("if (error) return false;");
  });
  it("el rótulo dice qué es el valor de abajo, no quién lo dio", () => {
    /* La tarjeta, el QR y la pantalla del comensal muestran el mismo rótulo
     * chico arriba del valor. Decía "Cliente" en modo identificador, que era
     * mentira cuando el local escribía una comanda como "A24". */
    const i18n = read("src/lib/i18n.ts");
    expect(i18n).toContain(
      'modo: { pedido: "Número", nombre: "Identificador", mesa: "Mesa" }',
    );
    expect(i18n).toContain(
      'modo: { pedido: "Number", nombre: "Identifier", mesa: "Table" }',
    );
    /* Y sale del modo, no de una constante por pantalla. */
    expect(read("src/components/panel/OrderCard.tsx")).toContain("t(`modo.${mode}`)");
    expect(read("src/components/customer/CustomerWaiting.tsx")).toContain(
      "t(`modo.${order.modo}`)",
    );
    expect(pedidos).toContain("etiqueta={t(`modo.${mode}`)}");
  });
});
