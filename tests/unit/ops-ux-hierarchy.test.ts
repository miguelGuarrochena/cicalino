import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Operación — jerarquía y layout", () => {
  it("QR: una columna en mobile, dos en tablet, tres o más en desktop", () => {
    const qr = read("src/app/(app)/panel/mesas/qr/page.tsx");
    const modal = read("src/components/panel/mesas/QrDownloadModal.tsx");
    expect(qr).toContain("grid-cols-1");
    expect(qr).toContain("md:grid-cols-2");
    expect(qr).toContain("lg:grid-cols-3");
    expect(qr).toContain("QrDownloadModal");
    expect(qr).toContain("descargarPlancha");
    expect(modal).toContain("descargarSolo");
    expect(modal).toContain("descargarMarco");
    expect(modal).toContain("sm:items-start");
    expect(qr).not.toContain("grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4");
  });

  it("Pedidos y Espera no duplican el filtro en tarjetas y chips", () => {
    const pedidos = read("src/app/(app)/panel/pedidos/page.tsx");
    const espera = read("src/app/(app)/panel/espera/page.tsx");
    expect(pedidos).not.toContain("panel.resumenActivos");
    expect(espera).not.toContain('f === "libre" ? "todas"');
  });

  it("Configuración separa identidad, pagos, mesas, personal, dispositivo y avanzado", () => {
    const nav = read("src/components/panel/config/ConfigNav.tsx");
    const page = read("src/app/(app)/panel/config/page.tsx");
    expect(nav).toContain('id: "identidad"');
    expect(nav).toContain('id: "pagos"');
    expect(nav).toContain('id: "mesas"');
    expect(nav).toContain('id: "empleados"');
    expect(nav).toContain('id: "dispositivo"');
    expect(nav).toContain('id: "avanzado"');
    expect(nav).not.toContain('id: "modulos"');
    expect(nav).not.toContain('id: "general"');
    expect(nav).not.toContain('id: "restaurante"');
    expect(page).toContain('acc("identidad")');
    expect(page).toContain('acc("pagos")');
    expect(page).toContain('acc("mesas")');
    expect(page).toContain('acc("avanzado")');
    expect(page).toContain('acc("dispositivo")');
    expect(page).toContain('acc("local")');
    expect(page).toContain("const Accordion");
    expect(page).toContain("setOpenSection");
    expect(page).toContain("openId === id");
    expect(page).toContain("goToConfigSection");
    expect(page).toContain("scrollIntoView");
    expect(page).toContain("el.open = open");
    expect(nav).toContain("flex-wrap");
    expect(nav).not.toContain("min-w-max");
    expect(nav).toContain("goToConfigSection");
    expect(nav).toContain("preventDefault");
    expect(read("src/components/panel/config/configHash.ts")).toContain("HashChangeEvent");
    expect(page).toContain("config.seccionLocal");
    expect(page).toContain("<SubscriptionCard embedded");
    expect(page).toContain("PedirSucursalCard embedded");
    expect(page).toContain("BrandIdentityCard embedded");
    expect(page).toContain("hideHeading");
    expect(page).toContain("config.seccionRecepcion");
    expect(page).toContain("PaymentMethodsCard");
    expect(page).toContain("BrandIdentityCard");
    expect(read("src/components/panel/config/PaymentMethodsCard.tsx")).toContain("qr_mercado_pago");
    /* Subscription, venue type and modules live in Datos de local, not Identidad. */
    const identidad = page.slice(page.indexOf('acc("identidad")'), page.indexOf('acc("pagos")'));
    expect(identidad).toContain("BrandIdentityCard");
    expect(identidad).not.toContain("config.seccionLocal");
    expect(identidad).not.toContain("config.seccionModulos");
    /* Reservation hours are not inside the salon-tables card. */
    const mesasBlock = page.slice(page.indexOf('acc("mesas")'), page.indexOf("config.seccionRecepcion"));
    expect(mesasBlock).toContain("config.tableCount");
    expect(mesasBlock).toContain("config.mesasQrCta");
    expect(mesasBlock).not.toContain("config.reservaHorario");
    expect(mesasBlock).not.toContain("config.diasCerrados");
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
    expect(mesas).toContain("ChargeInbox");
    expect(mesas).toContain("newOrderIds");
    expect(mesas).toContain("tabCobrarPulse");
    expect(mesas).toMatch(/tab === "pedido" \|\| tab === "turno"/);
    expect(mesas).toContain("flex flex-col gap-2");
    expect(mesas).toContain("onShowQr");
    expect(mesas).toContain("pathPrefix=\"/m\"");
    expect(mesas).toContain("venueName={branchName}");
    expect(mesas).toContain("JornadaBoard");
    expect(mesas).toContain("mesas.filtroTurno");
    expect(mesas).toContain("showDetail");
    expect(mesas).toMatch(/tab !== "turno"/);
    expect(detalle).toContain("w-full rounded-full bg-marca");
    expect(detalle).toContain("mesas.cobrar");
    expect(detalle).toContain("mesas.comanda");
    expect(detalle).toContain("mesas.pasarAComanda");
    expect(detalle).toContain("mesas.cancelarPedido");
    expect(detalle).toContain("mesas.pedidoMesaAyuda");
    expect(detalle).not.toContain("mesas.inboxAyuda");
    expect(detalle).not.toContain("mesas.marcarListo");
    expect(detalle).not.toContain("mesas.marcarEntregado");
    expect(detalle).not.toContain("mesa.estadoPedido.${o.status}");
    expect(detalle).toContain('o.status === "creado"');
    expect(detalle).toContain("mesas.cuenta");
    expect(detalle).toContain("from \"@/components/ui/Select\"");
    expect(detalle).not.toContain("<select");
    expect(detalle).toContain("mesas.pagoElegido");
    expect(detalle).toContain("min-h-11 w-full rounded-full bg-ok");
    expect(detalle).toContain("flex w-full flex-col gap-2");
    expect(guest).toContain("mesa.verCuenta");
    expect(guest).toContain("mesa.pedirCuenta");
    expect(guest).toContain("mesa.seguirPidiendo");
    expect(guest).toContain("mesa.llamarMozo");
    expect(qr).toContain('"/p" | "/e" | "/m"');
    expect(qr).toContain("qr.imprimir");
    expect(qr).toContain("venueName");
    const guestPage = read("src/app/(customer)/m/[token]/page.tsx");
    expect(guestPage).toContain("generateMetadata");
    expect(guestPage).toContain("fetchBranchBrand");
    expect(guestPage).not.toContain('branchName: ""');
  });

  it("Recepción sienta gente; el turno de quién atiende vive en Mesas", () => {
    const espera = read("src/app/(app)/panel/espera/page.tsx");
    const mesas = read("src/app/(app)/panel/mesas/page.tsx");
    const nav = read("src/lib/operation.ts");
    const pricing = read("src/lib/pricing.ts");
    expect(nav).toContain('key: "nav.espera"');
    expect(nav).toContain('key: "nav.mesas"');
    expect(espera).not.toContain("JornadaBoard");
    expect(espera).not.toContain("recepcion.jornada");
    expect(espera).toContain('t("nav.espera")');
    expect(mesas).toContain("JornadaBoard");
    expect(mesas).toContain("waiterName");
    expect(mesas).toContain("assignTable");
    expect(pricing).toContain('espera: "Recepción"');
  });

  it("el panel avisa en la nav sin bloquear y respeta reduced motion", () => {
    const nav = read("src/components/panel/PanelNav.tsx");
    const layout = read("src/app/(app)/panel/layout.tsx");
    const css = read("src/app/globals.css");
    const inbox = read("src/components/panel/mesas/KitchenInbox.tsx");
    const charge = read("src/components/panel/mesas/ChargeInbox.tsx");
    expect(layout).toContain("FloorAttentionWatch");
    expect(nav).toContain("headerUnseen");
    expect(nav).toContain("headerPedido");
    expect(nav).toContain("headerCuenta");
    expect(nav).toContain("nav.pedidoYCuenta");
    /* El aviso de la nav late fuerte: el pulso suave no se ve de reojo en un
     * salón lleno, que es la única situación en la que importa. */
    expect(nav).toContain("u-alert-beat");
    expect(nav).toContain("u-alert-halo");
    expect(nav).not.toContain("alert(");
    expect(css).toContain("u-alert-beat");
    expect(css).toContain("u-alert-halo");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("u-attention-dot");
    /* Sin movimiento el aviso no puede desaparecer: queda el halo fijo. */
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain("u-alert-beat");
    expect(reduced).toContain("box-shadow: 0 0 0 5px var(--halo)");
    expect(inbox).toContain("mesas.nuevo");
    expect(inbox).toContain("mesas.visto");
    expect(inbox).toContain("mesas.vistoAyuda");
    expect(charge).toContain("mesas.solicitaCuenta");
    expect(charge).toContain("mesas.cuentaSolicitada");
    expect(charge).toContain("mesas.verMesa");
    expect(charge).toContain("border-curso-borde");
    expect(inbox).toContain("mesas.solicitaCuenta");
    expect(inbox).toContain('tone="alerta"');
    const mesas = read("src/app/(app)/panel/mesas/page.tsx");
    expect(mesas).toContain("expanded={showClosed}");
    expect(mesas).not.toContain("tab === \"cobrar\" || showClosed");
    expect(nav).toContain("bg-curso");
  });

  it("el panel no usa el select nativo: las opciones van por el Select de la app", () => {
    const files = [
      "src/components/panel/mesas/TableDetail.tsx",
      "src/components/panel/mesas/CobrarModal.tsx",
      "src/components/panel/mesas/JornadaBoard.tsx",
      "src/components/panel/mesas/FloorTableTile.tsx",
      "src/components/panel/mesas/WeekCalendar.tsx",
      "src/components/panel/mesas/DayShiftModal.tsx",
      "src/components/panel/mesas/RangeAssignModal.tsx",
    ];
    for (const f of files) {
      expect(read(f), f).not.toMatch(/<select[\s>]/);
    }
    /* Solid fill per state, like the floor map in Recepción. Kitchen action
     * and the amount live in separate zones — not "Pedido nuevo" jammed next
     * to "Por cobrar". */
    const tile = read("src/components/panel/mesas/FloorTableTile.tsx");
    expect(tile).toContain("bg-alerta text-crema");
    expect(tile).toContain("bg-curso text-crema");
    expect(tile).toContain("bg-marca text-crema");
    expect(tile).toContain("bg-ok text-crema");
    expect(tile).toContain("bg-black/15");
    expect(tile).not.toContain("mesas.porCobrar");
    expect(tile).not.toContain("border-l-[6px]");
    expect(tile).not.toContain("verQrMesa");
    const turno = [
      read("src/components/panel/mesas/JornadaBoard.tsx"),
      read("src/components/panel/mesas/WeekCalendar.tsx"),
      read("src/components/panel/mesas/DayShiftModal.tsx"),
      read("src/components/panel/mesas/jornadaUi.ts"),
    ].join("\n");
    expect(turno).toContain("grid-cols-4");
    expect(turno).toContain("lg:grid-cols-8");
    expect(turno).toContain("aspect-square");
    expect(turno).toContain("grid-cols-7");
    expect(turno).toContain("todasLasMesas");
    expect(turno).toContain("guardarSemana");
    expect(turno).toContain("marcarCon");
    expect(turno).toContain("elegiQuien");
    expect(turno).toContain("diaCorto");
    expect(turno).toContain("min-h-11 w-full");
    expect(turno).toContain("WeekCalendar");
    expect(turno).toContain("DayShiftModal");
    expect(turno).toContain("RangeAssignModal");
    const tabs = read("src/components/ui/SegmentedTabs.tsx");
    expect(tabs).toContain("min-h-[4.5rem]");
    expect(tabs).toContain("grid-cols-2 sm:grid-cols-4");
    const mesasPage = read("src/app/(app)/panel/mesas/page.tsx");
    expect(mesasPage).toContain('k="pedido"');
    expect(mesasPage).toContain('k="cobrar"');
    expect(mesasPage).toContain('k="todas"');
    expect(mesasPage).toContain('k="turno"');
    expect(mesasPage).toContain('tone: "marca"');
    expect(mesasPage).toContain('tone: "curso"');
    expect(tabs).toContain('tone?: "marca" | "curso"');
  });
});
