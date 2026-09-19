import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sql = readFileSync(join(root, "supabase/mesa-pedido-comensal.sql"), "utf8");
const orden: string[] = JSON.parse(
  readFileSync(join(root, "supabase/orden.json"), "utf8"),
);
const chequeo = readFileSync(
  join(root, "supabase/chequeo-migraciones.sql"),
  "utf8",
);
const guest = readFileSync(
  join(root, "src/components/customer/table/TableGuestApp.tsx"),
  "utf8",
);
/* La pestaña de pedidos enviados salió de la pantalla grande cuando apareció
   la revisión previa al envío: son dos listas parecidas y lo importante es que
   no se confundan, así que cada una vive en su archivo. */
const enviados = readFileSync(
  join(root, "src/components/customer/table/SentOrders.tsx"),
  "utf8",
);
const inbox = readFileSync(
  join(root, "src/components/panel/mesas/KitchenInbox.tsx"),
  "utf8",
);

describe("Pedido de mesa — anotar y cancelar", () => {
  it("está después de split-payments y del barrido de Pedidos listos", () => {
    expect(orden.indexOf("split-payments.sql")).toBeLessThan(
      orden.indexOf("mesa-pedido-comensal.sql"),
    );
    expect(orden.indexOf("pedidos-en-preparacion.sql")).toBeLessThan(
      orden.indexOf("mesa-pedido-comensal.sql"),
    );
  });

  it("chequeo-migraciones lo registra", () => {
    expect(chequeo).toContain(
      "('mesa-pedido-comensal.sql', 'function', 'cancelar_pedido_comensal', 73)",
    );
    expect(chequeo).toContain("('mesa-pedido-comensal.sql', 'split-payments.sql, pedidos-en-preparacion.sql')");
  });

  it("el barrido a en_preparacion no toca pedidos de mesa", () => {
    const local = sql.slice(sql.indexOf("marcar_en_preparacion_local"));
    expect(local).toMatch(/sesion_id is null/);
    expect(local).toMatch(/estado = 'creado'/);
  });

  it("el comensal solo cancela mientras el pedido sigue en creado", () => {
    const fn = sql.slice(sql.indexOf("cancelar_pedido_comensal"));
    expect(fn).toMatch(/v_p\.estado <> 'creado'/);
    expect(fn).toContain("ya-anotado");
    expect(fn).toContain("pagos-exceden");
    expect(fn).toContain("cicalino.actor");
    expect(sql).toMatch(
      /grant execute on function public\.cancelar_pedido_comensal\(uuid, text, uuid\)\s+to service_role/,
    );
  });

  it("el cliente cancela desde Pedidos y no muestra precios ahí", () => {
    expect(guest).toContain("/pedidos/${orderId}/cancelar");
    expect(enviados).toContain('t("mesa.cancelarPedido")');
    expect(enviados).toContain('t("mesa.pedidosAyuda")');
    /* La cantidad quedó en su propio <span> para poder ponerla en negrita:
       la lista es lo que se lee de reojo para chequear que llegó bien. Lo que
       importa sigue siendo que el renglón diga cuánto y de qué. */
    expect(enviados).toContain("{i.quantity} ×");
    expect(enviados).toContain("{i.name}");
    expect(enviados).not.toContain("formatMoney");
  });

  it("lo ya enviado no se puede editar", () => {
    /* La diferencia con la revisión es justo esta: lo de esta lista ya lo
       tiene el local. Los +/− no existen acá, y lo único que se puede hacer
       —cancelar mientras no lo anotaron— es la regla que ya estaba. */
    expect(enviados).not.toContain("mesa.agregarUno");
    expect(enviados).not.toContain("mesa.quitarUno");
    expect(enviados).toContain('o.status === "creado" && mesaAbierta');
  });

  it("el panel copia el ticket y cancela desde la cola", () => {
    expect(inbox).toContain("mesas.copiarTicket");
    expect(inbox).toContain("mesas.cancelarPedido");
    expect(inbox).toContain("mesas.inboxAyuda");
    expect(inbox).toContain("min-h-12 w-full");
  });
});
