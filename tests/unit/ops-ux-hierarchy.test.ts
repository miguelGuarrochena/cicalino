import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Operación — jerarquía y layout", () => {
  it("QR: una columna en mobile, dos en tablet, tres o más en desktop", () => {
    const qr = read("src/app/(app)/panel/mesas/qr/page.tsx");
    expect(qr).toContain("grid-cols-1");
    expect(qr).toContain("md:grid-cols-2");
    expect(qr).toContain("lg:grid-cols-3");
    expect(qr).not.toContain("grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4");
  });

  it("Pedidos y Espera no duplican el filtro en tarjetas y chips", () => {
    const pedidos = read("src/app/(app)/panel/pedidos/page.tsx");
    const espera = read("src/app/(app)/panel/espera/page.tsx");
    expect(pedidos).not.toContain("panel.resumenActivos");
    expect(espera).not.toContain('f === "libre" ? "todas"');
  });

  it("Configuración vive en el menú ··· y el tema está afuera, como en la landing", () => {
    const menu = read("src/components/panel/PanelMenu.tsx");
    const layout = read("src/app/(app)/panel/layout.tsx");
    const nav = read("src/lib/operation.ts");
    expect(menu).toContain('href="/panel/config"');
    expect(menu).not.toContain("cycleTheme");
    expect(layout).toContain("ThemeToggle");
    expect(nav).not.toContain("nav.config");
  });

  it("Pagos: grilla compacta, atención primero, Cobrar es el CTA de la mesa", () => {
    const mesas = read("src/app/(app)/panel/mesas/page.tsx");
    const detalle = read("src/components/panel/mesas/TableDetail.tsx");
    const guest = read("src/components/customer/table/TableGuestApp.tsx");
    const qr = read("src/components/panel/QrModal.tsx");
    expect(mesas).toContain("grid-cols-3");
    expect(mesas).toContain("minmax(9.5rem,1fr)");
    expect(mesas).toContain("mesas.filtroPedido");
    expect(mesas).toContain("KitchenInbox");
    expect(mesas).toMatch(/filtro === "pedido"\s*\? \[\]/);
    expect(mesas).toContain("flex flex-col gap-2");
    expect(mesas).toContain("onShowQr");
    expect(mesas).toContain("pathPrefix=\"/m\"");
    expect(detalle).toContain("w-full rounded-full bg-marca");
    expect(detalle).toContain("mesas.cobrar");
    expect(detalle).toContain("mesas.comanda");
    expect(detalle).toContain("mesas.cuenta");
    expect(detalle).toContain("from \"@/components/ui/Select\"");
    expect(detalle).not.toContain("<select");
    expect(detalle).toContain("mesas.pagoElegido");
    expect(detalle).toContain("min-h-11 w-full rounded-full bg-ok");
    expect(detalle).toContain("flex w-full flex-col gap-2");
    expect(guest).toContain("mesa.verCuenta");
    expect(guest).toContain("mesa.pagar");
    expect(guest).toContain("mesa.seguirPidiendo");
    expect(guest).toContain("mesa.llamarMozo");
    expect(qr).toContain('"/p" | "/e" | "/m"');
    expect(qr).toContain("qr.imprimir");
  });

  it("Recepción es el módulo y Mesas es la operación: jornada y mozo no se mezclan", () => {
    const espera = read("src/app/(app)/panel/espera/page.tsx");
    const mesas = read("src/app/(app)/panel/mesas/page.tsx");
    const nav = read("src/lib/operation.ts");
    const pricing = read("src/lib/pricing.ts");
    expect(nav).toContain('key: "nav.espera"');
    expect(nav).toContain('key: "nav.mesas"');
    expect(espera).toContain("JornadaBoard");
    expect(espera).toContain('t("nav.espera")');
    expect(mesas).toContain("waiterName");
    expect(mesas).toContain("assignTable");
    expect(pricing).toContain('espera: "Recepción"');
  });

  it("el panel no usa el select nativo: las opciones van por el Select de la app", () => {
    const files = [
      "src/components/panel/mesas/TableDetail.tsx",
      "src/components/panel/mesas/CobrarModal.tsx",
      "src/components/panel/espera/JornadaBoard.tsx",
      "src/components/panel/mesas/FloorTableTile.tsx",
    ];
    for (const f of files) {
      expect(read(f), f).not.toMatch(/<select[\s>]/);
    }
    const tile = read("src/components/panel/mesas/FloorTableTile.tsx");
    expect(tile).toContain("bg-alerta-fondo");
    expect(tile).toContain("bg-curso-fondo");
    expect(tile).toContain("bg-marca/20");
  });
});
