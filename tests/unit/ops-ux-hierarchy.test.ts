import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Operación — jerarquía y layout", () => {
  it("QR: una columna en mobile, dos en tablet, tres o más en desktop", () => {
    const qr = read("src/app/(app)/panel/pagos/qr/page.tsx");
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
    const mesas = read("src/app/(app)/panel/pagos/page.tsx");
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
    expect(mesas).toContain('tab === "pedido"');
    expect(mesas).toContain("flex flex-col gap-2");
    expect(mesas).toContain("onShowQr");
    expect(mesas).toContain("pathPrefix=\"/m\"");
    expect(mesas).toContain("venueName={branchName}");
    expect(read("src/app/(app)/panel/pagos/turnos/page.tsx")).toContain("JornadaBoard");
    expect(mesas).toContain("mesas.filtroTurno");
    expect(mesas).toContain("showDetail");
    /* Turnos dejó de ser un modo de esta pantalla: es una pantalla. El glifo
     * sigue llamándose "turno" — lo que no existe más es el estado. */
    expect(mesas).not.toContain('tab === "turno"');
    expect(mesas).not.toContain('| "turno"');
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
    /* Confirmar y cancelar miden lo mismo al tacto (48 px, 44 en desktop) y se
     * distinguen por peso visual: lleno vs. borde. Un "Cancelar" de letra
     * chica se falla con el dedo, y fallar el de cancelar un cobro cuesta. */
    expect(detalle).toContain("min-h-12 items-center justify-center rounded-full bg-ok");
    expect(detalle).toContain("min-h-12 items-center justify-center rounded-full border border-linea");
    /* Dos columnas si entran, apiladas si no, sin medir el ancho en JS. */
    expect(detalle).toContain("grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]");
    expect(detalle).toContain("flex w-full flex-col gap-1.5");
    /* La barra de abajo salió de la pantalla grande: ahora tiene una regla
       propia —cuando hay algo sin enviar, el pedido se queda con la barra en
       cualquier pestaña— y eso merecía su archivo. */
    const barra = read("src/components/customer/table/TableBottomBar.tsx");
    expect(barra).toContain("mesa.verCuenta");
    expect(barra).toContain("mesa.pedirCuenta");
    expect(barra).toContain("mesa.seguirPidiendo");
    expect(barra).toContain("mesa.verPedido");
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
    const mesas = read("src/app/(app)/panel/pagos/page.tsx");
    const nav = read("src/lib/operation.ts");
    const pricing = read("src/lib/pricing.ts");
    expect(nav).toContain('key: "nav.espera"');
    expect(nav).toContain('key: "nav.pagos"');
    expect(espera).not.toContain("JornadaBoard");
    expect(espera).not.toContain("recepcion.jornada");
    expect(espera).toContain('t("nav.espera")');
    expect(read("src/app/(app)/panel/pagos/turnos/page.tsx")).toContain("JornadaBoard");
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
    /* De dónde sale cada número lo resuelve el hook: la nav y el hub cuelgan
     * el mismo dato de botones distintos. */
    const pendientes = read("src/lib/hooks/useNavPending.ts");
    expect(layout).toContain("FloorAttentionWatch");
    expect(pendientes).toContain("headerUnseen");
    expect(pendientes).toContain("headerPedido");
    expect(pendientes).toContain("headerCuenta");
    expect(pendientes).toContain("nav.pedidoYCuenta");
    expect(nav).toContain("useNavPending");
    /* El contador vive en un solo componente —lo dibujaban tres— y es un globo
     * superpuesto, como el de mensajes sin leer: 10 px adentro del botón es un
     * detalle decorativo, y esto tiene que verse de reojo desde el salón. */
    const globo = read("src/components/ui/CountBadge.tsx");
    expect(nav).toContain("CountBadge");
    expect(globo).toContain("u-alert-beat");
    expect(globo).toContain("u-alert-halo");
    expect(globo).toContain("rounded-full");
    /* Cero no dibuja nada, y no crece sin límite. */
    expect(globo).toContain("if (n <= 0) return null;");
    expect(globo).toContain('n > 99 ? "99+" : n');
    /* Asomado por la esquina, no adentro. */
    expect(nav).toContain("absolute -right-5 -top-4");
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
    /* El matiz "visto en este dispositivo" se lee en pantalla, no en un
     * `title` que en el teléfono no aparece nunca. */
    expect(inbox).toContain("mesas.vistoDispositivo");
    /* Y se renderiza como texto, no como tooltip del navegador. */
    expect(inbox).toContain("{nota}");
    expect(inbox).not.toContain("mesas.vistoAyuda");
    expect(charge).toContain("mesas.solicitaCuenta");
    expect(charge).toContain("mesas.cuentaSolicitada");
    expect(charge).toContain("mesas.verMesa");
    expect(charge).toContain("border-curso-borde");
    expect(inbox).toContain("mesas.solicitaCuenta");
    expect(inbox).toContain('tone="alerta"');
    const mesas = read("src/app/(app)/panel/pagos/page.tsx");
    /* El día cerrado salió del pie de la lista —donde desaparece justo la
     * noche que hay treinta mesas— y subió a su propio botón. */
    expect(mesas).toContain('href="/panel/pagos/historial"');
    expect(mesas).toContain("mesas.historial");
    expect(mesas).not.toContain("ClosedTodayList");
    expect(mesas).not.toContain("showClosed");
    /* El tono lo elige quien lo usa; los colores viven en el globo. Cada
     * sección late del color de su sección —el mismo de su círculo en el hub—
     * y lo decide el hook, así la nav y el hub no se pueden ir a distinto. */
    const pendiente = read("src/lib/hooks/useNavPending.ts");
    expect(pendiente).toContain('"/panel/pedidos": "marca"');
    expect(pendiente).toContain('"/panel/espera": "espera"');
    expect(pendiente).toContain('"/panel/pagos": "pagos"');
    /* Pagos ya no se pone ámbar por tener una cuenta esperando: esa condición
     * es casi siempre verdadera en hora pico y tapaba el color del módulo. El
     * matiz sigue en las pestañas de adentro de Pagos. */
    expect(pendiente).not.toContain('"curso"');
    expect(read("src/components/ui/SegmentedTabs.tsx")).toContain(
      'opt.priority ? "curso" : "marca"',
    );
    expect(nav).toContain("tone={tone}");
    expect(read("src/components/ui/CountBadge.tsx")).toContain("bg-curso");
  });

  it("el hub avisa lo mismo que la nav, sin contar dos veces", () => {
    const hub = read("src/components/panel/ModuleHub.tsx");
    const nav = read("src/components/panel/PanelNav.tsx");
    /* El hub es donde arranca el turno: si Pedidos tiene tres esperando, se
     * tiene que ver antes de elegir a dónde entrar. */
    expect(hub).toContain("useNavPending");
    expect(hub).toContain("CountBadge");
    expect(hub).toContain("aria-label={label(t(l.key))}");
    /* Colgado del círculo, no de la tarjeta: la tarjeta incluye el texto de
     * abajo y el globo terminaría flotando al lado del nombre. */
    expect(hub).toContain("absolute right-0 top-0");
    expect(hub).toContain("relative flex size-[4.5rem]");
    /* Nadie recalcula de dónde sale el número: las dos superficies preguntan
     * lo mismo al mismo hook. */
    for (const src of [hub, nav]) {
      expect(src).not.toContain("usePanelAlertCounts");
      expect(src).not.toContain("useFloorAttention");
    }
  });

  it("los nombres que escribe el cliente no pierden la panza de la g", () => {
    /* `truncate` es `overflow:hidden`. Con `leading-none` la caja mide
     * exactamente lo que mide la letra, así que las descendentes —la g de
     * Miguel, la y de Nahuel Y.— quedaban cortadas por abajo. El número del
     * pedido no tiene descendentes y por eso el corte solo se veía en el
     * alias. */
    const conAlias = [
      "src/components/panel/OrderCard.tsx",
      "src/components/panel/QrModal.tsx",
      "src/components/panel/mesas/FloorTableTile.tsx",
    ];
    for (const rel of conAlias) {
      const src = read(rel);
      for (const linea of src.split("\n")) {
        /* Solo las líneas de clases: si no, el propio comentario que explica
         * esta regla la hace fallar. */
        if (!linea.includes("className")) continue;
        if (!linea.includes("truncate")) continue;
        expect(linea.includes("leading-none"), `${rel}: ${linea.trim()}`).toBe(
          false,
        );
      }
    }
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
    /* "Pago a confirmar" es la excepción y es a propósito: va con el par claro
     * del tema. Contra la roja de "te llaman", el ámbar pleno tenía el mismo
     * tono oscuro (ΔE 21, y ΔE 7 para quien no distingue el rojo). Invertir la
     * luminosidad es lo único que sobrevive a mirar el piso desde lejos. */
    expect(tile).toContain("bg-curso-fondo text-curso");
    expect(tile).not.toContain("bg-curso text-crema");
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
    const mesasPage = read("src/app/(app)/panel/pagos/page.tsx");
    expect(mesasPage).toContain('k="pedido"');
    expect(mesasPage).toContain('k="cobrar"');
    expect(mesasPage).toContain('k="todas"');
    /* Turnos salió de las pestañas operativas: es administración, no algo que
     * el mozo toque durante el servicio. Sigue llegándose desde la pantalla,
     * con su botón propio — por eso se mira el bloque de pestañas y no el
     * archivo entero. */
    const pestanas = mesasPage.slice(
      mesasPage.indexOf("<SegmentedTabs"),
      mesasPage.indexOf("{tab === \"turno\" ?"),
    );
    expect(pestanas).toContain('k="pedido"');
    expect(pestanas).not.toContain('k="turno"');
    expect(mesasPage).toContain('href="/panel/pagos/turnos"');
    /* Y se ven como botones, no como links sueltos: redondos y con ícono,
       igual que la navegación, pero de contorno para no competirle. */
    expect(mesasPage).toContain('<TabGlyph k="qr" size={18} />');
    expect(mesasPage).toContain('<TabGlyph k="turno" size={18} />');
    expect(mesasPage).toContain("rounded-full border border-linea bg-surface px-4");
    expect(mesasPage).toContain('tone: "marca"');
    expect(mesasPage).toContain('tone: "curso"');
    expect(tabs).toContain('tone?: "marca" | "curso"');
  });
});

/* El sticker del QR se imprime desde la app, no desde una ventana aparte.
 *
 * Antes esto abría un `window.open` en blanco y le escribía HTML a mano: el
 * sticker salía en `system-ui` y `#111`, no se parecía a Cicalino, y si el
 * navegador bloqueaba los emergentes el botón no hacía absolutamente nada. */
describe("Impresión del QR", () => {
  const modal = read("src/components/panel/QrModal.tsx");
  const papel = read("src/components/panel/PrintableQr.tsx");
  const css = read("src/app/globals.css");

  it("no abre ninguna ventana ni escribe HTML a mano", () => {
    expect(modal).not.toContain("window.open");
    expect(modal).not.toContain("document.write");
    expect(modal).toContain("window.print()");
  });

  it("el papel vive en el documento, oculto en pantalla", () => {
    expect(papel).toContain("hidden");
    expect(papel).toContain("print:block");
    expect(modal).toContain("PrintableQr");
    /* Va en su propio portal: el modal vive en otro y se esconde al imprimir. */
    expect(modal).toContain("createPortal");
  });

  it("al imprimir no se cuela nada del panel", () => {
    expect(modal).toContain('document.body.dataset.imprimiendo = "qr"');
    /* Y se limpia tanto al volver del diálogo como al cerrar el modal. */
    expect(modal).toContain('addEventListener("afterprint"');
    expect(modal).toContain("delete document.body.dataset.imprimiendo");
    const regla = css.slice(css.indexOf('body[data-imprimiendo="qr"]'));
    expect(regla).toContain('*:not([data-imprimible="qr"])');
    expect(regla).toContain("display: none");
  });

  it("la regla está atada a la marca, así no rompe otras impresiones", () => {
    /* La cuenta de la mesa (PrintableBill) imprime por su cuenta con
     * `print:hidden` en cada ancestro: esta regla no la tiene que tocar. */
    const bloque = css.slice(
      css.indexOf("---- Imprimir solo el sticker"),
      css.indexOf("Scroll interno de modales"),
    );
    expect(bloque).toContain('body[data-imprimiendo="qr"]');
    expect(bloque).not.toMatch(/^\s*body\s*>/m);
  });

  it("el papel imprime en negro sobre blanco aunque el panel esté en oscuro", () => {
    /* Con tokens de tema, `text-carbon` en modo oscuro sale casi blanco.
     * Se mira el JSX y no el archivo entero: el comentario los nombra. */
    const jsx = papel.slice(papel.indexOf("return ("));
    expect(jsx).toContain("bg-white");
    expect(jsx).toContain("text-black");
    expect(jsx).not.toContain("text-carbon");
    expect(jsx).not.toContain("bg-crema");
  });

  it("el QR del papel es negro y de más resolución que el de pantalla", () => {
    expect(modal).toContain("printUrl");
    const i = modal.indexOf(".then(setPrintUrl)");
    const paraPapel = modal.slice(modal.lastIndexOf("QRCode.toDataURL", i), i);
    expect(paraPapel).toContain("width: 1024");
    expect(paraPapel).toContain('dark: "#000000"');
    expect(paraPapel).toContain('errorCorrectionLevel: "H"');
    /* 68 mm: entra en un sticker y escanea desde el borde de la mesa. */
    expect(papel).toContain("68mm");
  });

  it("la descarga del PNG sigue siendo el otro camino", () => {
    const qr = read("src/app/(app)/panel/pagos/qr/page.tsx");
    expect(qr).toContain("QrDownloadModal");
    expect(read("src/components/panel/mesas/QrDownloadModal.tsx")).toContain("descargarSolo");
  });
});

/* El bloque de cobros de una mesa: una acción por persona y una sola global.
 *
 * El mismo pago pendiente de Juan llegó a tener tres botones "Confirmar pago"
 * en pantalla: el aviso de arriba, la cuenta de abajo y el modal de cobrar.
 * Los tres llamaban a la misma RPC. */
describe("Cobros de una mesa: sin acciones repetidas", () => {
  const detalle = read("src/components/panel/mesas/TableDetail.tsx");
  const modal = read("src/components/panel/mesas/CobrarModal.tsx");

  it("cada pago tiene sus botones en un solo lugar, según su estado", () => {
    /* Pendiente arriba (confirmar/cancelar), ya pagado abajo (anular). */
    expect(detalle).toContain("const paymentActions = (p: BillPayment, soloRegistro = false)");
    expect(detalle).toContain("actions={(p) => paymentActions(p, true)}");
    expect(detalle).toContain('if (!soloRegistro && p.status !== "pendiente") return null;');
  });

  it("el modal de cobrar registra plata nueva; no confirma la que ya está anotada", () => {
    expect(modal).not.toContain("confirmTablePayment");
    expect(modal).not.toContain("confirmWaiting");
    /* Los muestra, para que el mozo sepa por qué el monto es menor. */
    expect(modal).toContain("waiting.map");
    expect(modal).toContain("mesas.confirmarEnCuenta");
    /* Y su botón dice lo que hace. */
    expect(modal).toContain("mesas.registrarCobroN");
    expect(modal).not.toContain("mesas.confirmarPagoN");
  });

  it("la acción global aparece solo cuando ahorra toques", () => {
    /* Con un solo pago esperando, el botón de esa persona ya es la acción
     * global: dos botones para el mismo pago es justo lo que había que sacar. */
    expect(detalle).toContain("waitingPayments.length > 1 && (");
    expect(detalle).toContain("mesas.confirmarTodos");
    expect(detalle).toContain("confirmarPendientes");
  });

  it("confirmar todo no inventa un pago ni elige método por nadie", () => {
    const fn = detalle.slice(
      detalle.indexOf("const confirmarPendientes"),
      detalle.indexOf("const moveOrder"),
    );
    expect(fn).toContain("for (const p of waitingPayments)");
    expect(fn).toContain("confirmTablePayment(p.id, employeeId)");
    /* Nada de registrar cobros nuevos por su cuenta: eso es "Cobrar". */
    expect(fn).not.toContain("registerStaffPayment");
    /* Si uno falla, corta y lo dice; los anteriores quedaron confirmados. */
    expect(fn).toContain("break");
    expect(fn).toContain("errorText(fallo)");
  });

  it("«Cobrar» solo aparece si queda algo por registrar", () => {
    /* Con todo lo pendiente ya anotado, `available` es 0 y el modal solo podía
     * decir "todo reservado": era un botón que abría un callejón. */
    expect(detalle).toContain("open && bill.totals.available > 0 && (");
    expect(detalle).not.toContain("open && pending > 0 && (");
  });

  it("el resumen dice cuántos pagos esperan antes de ofrecer nada", () => {
    const i = detalle.indexOf("mesas.pagosEsperandoN");
    const j = detalle.indexOf("mesas.confirmarTodos");
    expect(i).toBeGreaterThan(-1);
    /* El número va antes que el botón: primero qué pasa, después qué hacer. */
    expect(i).toBeLessThan(j);
  });
});
