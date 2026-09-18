import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sql = readFileSync(join(root, "supabase/mesa-llamado-mozo.sql"), "utf8");
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
const mesas = readFileSync(
  join(root, "src/app/(app)/panel/pagos/page.tsx"),
  "utf8",
);

describe("Llamar mesero/a", () => {
  it("está después de split-payments y del pedido de mesa", () => {
    expect(orden.indexOf("split-payments.sql")).toBeLessThan(
      orden.indexOf("mesa-llamado-mozo.sql"),
    );
    expect(orden.indexOf("mesa-pedido-comensal.sql")).toBeLessThan(
      orden.indexOf("mesa-llamado-mozo.sql"),
    );
  });

  it("chequeo-migraciones lo registra", () => {
    expect(chequeo).toContain(
      "('mesa-llamado-mozo.sql', 'column', 'mesa_sesiones.llamado_en', 74)",
    );
    expect(chequeo).toContain(
      "('mesa-llamado-mozo.sql', 'function', 'llamar_mozo_comensal', 74)",
    );
    expect(chequeo).toContain("('mesa-llamado-mozo.sql', 'split-payments.sql, mesa-pedido-comensal.sql')");
  });

  it("el comensal prende el llamado; el personal lo apaga", () => {
    expect(sql).toMatch(/add column if not exists llamado_en/);
    expect(sql).toContain("'llamado_en', v_s.llamado_en");
    const guestFn = sql.slice(sql.indexOf("llamar_mozo_comensal"));
    expect(guestFn).toContain("ya-llamado");
    expect(guestFn).toContain("mozo_llamado");
    expect(sql).toContain("pagar_como_comensal");
    expect(sql).not.toContain("v_metodo <> 'mercado_pago'");
    expect(sql).toMatch(
      /grant execute on function public\.llamar_mozo_comensal\(uuid, text\)\s+to service_role/,
    );
    const staffFn = sql.slice(sql.indexOf("atender_llamado_mesa"));
    expect(staffFn).toContain("_staff_puede");
    expect(staffFn).toContain("llamado_atendido");
  });

  it("el cliente tiene el botón y el panel lo ve en Pedido", () => {
    expect(guest).toContain("/api/m/${token}/llamar");
    expect(guest).toContain('t("mesa.llamarMozo")');
    expect(mesas).toContain("mesas.filtroPedido");
    expect(mesas).toContain("onAcknowledge");
    expect(mesas).toContain("onShowQr");
    /* El aviso ya no es un toast dentro de Mesas: lo da la capa global, que se
     * ve desde cualquier sección y queda hasta que alguien lo atiende. */
    expect(mesas).not.toContain("teLlamanToast");
    const alertas = readFileSync(join(root, "src/lib/panelAlerts.ts"), "utf8");
    expect(alertas).toContain('"llamado"');
    expect(alertas).toContain("alertas.llamado");
  });

  it("pedir la cuenta no prende Te llaman: eso va a Cobrar", () => {
    const pagos = readFileSync(join(root, "src/app/api/m/[token]/pagos/route.ts"), "utf8");
    expect(pagos).not.toContain("callWaiter");
    expect(pagos).toContain("mercado_pago");
    const pedir = readFileSync(join(root, "supabase/mesa-pedir-cuenta.sql"), "utf8");
    expect(pedir).toContain("pagar_como_comensal");
    expect(pedir).not.toContain("llamado_en");
    const detalle = readFileSync(
      join(root, "src/components/panel/mesas/TableDetail.tsx"),
      "utf8",
    );
    expect(detalle).toContain("mesas.pagoElegido");
    expect(detalle).toContain("min-h-11 w-full");
  });
});
