import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  alertIsElsewhere,
  alertsBySource,
  arrivedIds,
  counterAlerts,
  mesaAlerts,
  receptionAlerts,
  sortAlerts,
  type PanelAlert,
} from "@/lib/panelAlerts";
import {
  emptyAttentionSeen,
  floorAttention,
  mpPaidIds,
  pendingBillIds,
  pendingOrderIds,
  waiterCallSessionIds,
} from "@/lib/floorAttention";
import {
  ackPanelAlerts,
  ackPanelSource,
  getLiveAlertCounts,
  getLiveAlerts,
  hydratePanelAlerts,
  publishPanelAlerts,
} from "@/lib/store/panel-alert-store";
import {
  cardAckOrders,
  getFloorAttentionState,
  hydrateFloorAttention,
  pruneFloorAttention,
} from "@/lib/store/attention-store";
import { buildFloor, kitchenInbox } from "@/lib/tableOps";
import { translate } from "@/lib/i18n";
import type { BillOrder, BillPayment, TableBill } from "@/lib/tableBill";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const order = (over: Partial<BillOrder> = {}): BillOrder => ({
  id: over.id ?? "o1",
  guestId: "juan",
  status: over.status ?? "creado",
  createdAt: over.createdAt ?? "2026-09-16T20:00:00Z",
  readyAt: null,
  deliveredAt: null,
  cancelledAt: null,
  items: [],
  ...over,
});

const pay = (over: Partial<BillPayment> = {}): BillPayment => ({
  id: over.id ?? "pay1",
  guestId: "juan",
  payerName: "Juan",
  mode: "consumo",
  parts: 1,
  base: 10000,
  tip: 0,
  tipPercent: null,
  surcharge: 0,
  surchargePercent: 0,
  total: 10000,
  method: "efectivo",
  status: "pendiente",
  createdBy: "comensal",
  confirmation: null,
  createdAt: "2026-09-16T20:05:00Z",
  confirmedAt: null,
  cancelledAt: null,
  cancelReason: null,
  expiresAt: null,
  mpStatus: null,
  ...over,
});

const bill = (over: Partial<TableBill> = {}): TableBill => ({
  session: {
    id: "s1",
    branchId: "l1",
    tableId: "m8",
    tableNumber: 8,
    status: "abierta",
    splitMode: null,
    parts: null,
    version: 1,
    openedAt: "2026-09-16T20:00:00Z",
    updatedAt: "2026-09-16T20:00:00Z",
    paidAt: null,
    closedAt: null,
    closeReason: null,
    calledAt: null,
    billState: "abierta" as const,
    intent: null,
    requestedAt: null,
    requestedBy: null,
    fullPayerId: null,
    fullPayerName: null,
    ...over.session,
  },
  guests: over.guests ?? [],
  orders: over.orders ?? [order()],
  payments: over.payments ?? [],
  totals: {
    consumption: 10000,
    tips: 0,
    surcharges: 0,
    total: 10000,
    paid: 0,
    pendingConfirmation: 0,
    paidBase: 0,
    committedBase: 0,
    committedParts: 0,
    uncovered: 10000,
    available: 10000,
    ...over.totals,
  },
});

const alertaMesaLlamando = (): PanelAlert[] => {
  const b = bill({
    session: { ...bill().session, calledAt: "2026-09-16T20:10:00Z" },
    orders: [order()],
    payments: [pay()],
  });
  return mesaAlerts([b], floorAttention([b], emptyAttentionSeen(), null));
};

describe("Capa global de avisos del panel", () => {
  it("llamado, pedido y cuenta de una mesa entran al mismo tablero", () => {
    const alerts = alertaMesaLlamando();
    expect(alerts.map((a) => a.kind).sort()).toEqual([
      "cuenta",
      "llamado",
      "pedido-mesa",
    ]);
    expect(alerts.every((a) => a.source === "mesas")).toBe(true);
    expect(alerts.every((a) => a.table === 8)).toBe(true);
  });

  it("el que está levantando la mano va primero", () => {
    const ordenado = sortAlerts(alertaMesaLlamando());
    expect(ordenado.map((a) => a.kind)).toEqual([
      "llamado",
      "cuenta",
      "pedido-mesa",
    ]);
  });

  it("Pedidos y Recepción entran por la misma puerta que Mesas", () => {
    const mostrador = counterAlerts([
      { id: "p1", reference: "14", createdAt: "2026-09-16T20:01:00Z" },
    ]);
    const recepcion = receptionAlerts([
      { id: "e1", name: "Ana", status: "esperando", createdAt: "2026-09-16T20:02:00Z" },
      { id: "e2", name: "Beto", status: "sentado", createdAt: "2026-09-16T20:03:00Z" },
    ]);
    expect(mostrador.map((a) => a.href)).toEqual(["/panel/pedidos"]);
    /* El que ya está sentado no es novedad. */
    expect(recepcion.map((a) => a.label)).toEqual(["Ana"]);
    expect(alertsBySource([...alertaMesaLlamando(), ...mostrador, ...recepcion])).toEqual({
      mesas: 3,
      pedidos: 1,
      recepcion: 1,
    });
  });

  it("suena lo que llegó, no lo que sigue pendiente", () => {
    const alerts = alertaMesaLlamando();
    const conocidos = new Set(alerts.map((a) => a.id));
    expect(arrivedIds(conocidos, alerts)).toEqual([]);
    expect(arrivedIds(new Set(), alerts)).toHaveLength(3);
  });

  it("el aviso no se repite sobre la pantalla que lo originó", () => {
    const [a] = counterAlerts([
      { id: "p1", reference: "14", createdAt: "2026-09-16T20:01:00Z" },
    ]);
    expect(alertIsElsewhere(a, "/panel/pedidos")).toBe(false);
    expect(alertIsElsewhere(a, "/panel/pagos")).toBe(true);
    expect(alertIsElsewhere(a, "/panel/config")).toBe(true);
    /* Mesas › QR no muestra ninguna bandeja: ahí el aviso sí tiene que salir. */
    const [m] = sortAlerts(alertaMesaLlamando());
    expect(alertIsElsewhere(m, "/panel/pagos/qr")).toBe(true);
  });
});

describe("Tablero global — publicar, ver y dar por visto", () => {
  beforeEach(() => {
    /* El "visto" se guarda por sucursal en el dispositivo y sobrevive entre
     * tests: sin limpiarlo, un caso arranca con lo que otro dio por visto. */
    localStorage.clear();
    hydratePanelAlerts(null);
    hydrateFloorAttention(null);
    hydratePanelAlerts("local-1");
    hydrateFloorAttention("local-1");
    publishPanelAlerts("mesas", []);
    publishPanelAlerts("pedidos", []);
    publishPanelAlerts("recepcion", []);
  });

  it("junta las tres fuentes y las ordena por urgencia", () => {
    publishPanelAlerts("mesas", alertaMesaLlamando());
    publishPanelAlerts("pedidos", counterAlerts([
      { id: "p1", reference: "14", createdAt: "2026-09-16T20:01:00Z" },
    ]));
    publishPanelAlerts("recepcion", receptionAlerts([
      { id: "e1", name: "Ana", status: "esperando", createdAt: "2026-09-16T20:02:00Z" },
    ]));
    expect(getLiveAlerts()).toHaveLength(5);
    expect(getLiveAlerts()[0].kind).toBe("llamado");
    expect(getLiveAlertCounts()).toEqual({ mesas: 3, pedidos: 1, recepcion: 1 });
  });

  it("dar por visto lo saca del aviso sin resolver el trabajo", () => {
    const mostrador = counterAlerts([
      { id: "p1", reference: "14", createdAt: "2026-09-16T20:01:00Z" },
    ]);
    publishPanelAlerts("pedidos", mostrador);
    expect(getLiveAlerts()).toHaveLength(1);
    ackPanelAlerts(mostrador);
    expect(getLiveAlerts()).toEqual([]);
    /* El pedido sigue publicado: sigue sin prepararse, solo dejó de gritar. */
    expect(getLiveAlertCounts().pedidos).toBe(0);
  });

  it("lo de Mesas se marca visto en el store de Mesas, no en dos lugares", () => {
    const alerts = alertaMesaLlamando();
    publishPanelAlerts("mesas", alerts);
    ackPanelAlerts(alerts);
    const { seen } = getFloorAttentionState();
    expect([...seen.cardCalls]).toEqual(["s1"]);
    expect([...seen.cardOrders]).toEqual(["o1"]);
    expect([...seen.cardPayments]).toEqual(["pay1"]);
  });

  it("entrar a la sección cuenta como haberla mirado", () => {
    publishPanelAlerts("recepcion", receptionAlerts([
      { id: "e1", name: "Ana", status: "esperando", createdAt: "2026-09-16T20:02:00Z" },
    ]));
    publishPanelAlerts("pedidos", counterAlerts([
      { id: "p1", reference: "14", createdAt: "2026-09-16T20:01:00Z" },
    ]));
    ackPanelSource("recepcion");
    expect(getLiveAlertCounts()).toEqual({ mesas: 0, pedidos: 1, recepcion: 0 });
  });

  it("el mozo está en Configuración y la mesa 8 llama: se entera igual", () => {
    /* El caso que motivó todo esto. La sección abierta no decide nada: las
     * alertas viven en el tablero y el aviso solo se calla sobre la pantalla
     * que ya muestra ese detalle. */
    publishPanelAlerts("mesas", alertaMesaLlamando());
    const enConfig = getLiveAlerts().filter((a) => alertIsElsewhere(a, "/panel/config"));
    expect(enConfig).toHaveLength(3);
    expect(enConfig[0].kind).toBe("llamado");
    expect(enConfig[0].href).toBe("/panel/pagos");
    const enMesas = getLiveAlerts().filter((a) => alertIsElsewhere(a, "/panel/pagos"));
    expect(enMesas).toEqual([]);
  });

  /* La matriz que importa: da igual dónde esté parado el empleado, la novedad
   * de otro módulo llega. Lo único que se calla es lo de la pantalla abierta,
   * porque ahí el detalle ya está a la vista. */
  it("cada sección recibe las novedades de las otras", () => {
    publishPanelAlerts("mesas", alertaMesaLlamando());
    publishPanelAlerts("pedidos", counterAlerts([
      { id: "p1", reference: "14", createdAt: "2026-09-16T20:01:00Z" },
    ]));
    publishPanelAlerts("recepcion", receptionAlerts([
      { id: "e1", name: "Ana", status: "esperando", createdAt: "2026-09-16T20:02:00Z" },
    ]));
    const visiblesEn = (path: string) =>
      getLiveAlerts()
        .filter((a) => alertIsElsewhere(a, path))
        .map((a) => a.source);

    expect(visiblesEn("/panel/config").sort()).toEqual([
      "mesas",
      "mesas",
      "mesas",
      "pedidos",
      "recepcion",
    ]);
    expect(visiblesEn("/panel/pagos").sort()).toEqual(["pedidos", "recepcion"]);
    expect(visiblesEn("/panel/espera").sort()).toEqual([
      "mesas",
      "mesas",
      "mesas",
      "pedidos",
    ]);
    expect(visiblesEn("/panel/pedidos").sort()).toEqual([
      "mesas",
      "mesas",
      "mesas",
      "recepcion",
    ]);
  });

  it("lo que dejó de estar vivo se olvida y vuelve a avisar si pasa de nuevo", () => {
    const mostrador = counterAlerts([
      { id: "p1", reference: "14", createdAt: "2026-09-16T20:01:00Z" },
    ]);
    publishPanelAlerts("pedidos", mostrador);
    ackPanelAlerts(mostrador);
    publishPanelAlerts("pedidos", []);
    publishPanelAlerts("pedidos", mostrador);
    expect(getLiveAlerts()).toHaveLength(1);
  });
});

describe("Cableado: una sola capa, montada en el layout", () => {
  it("el panel entero escucha, no solo la sección abierta", () => {
    const layout = read("src/app/(app)/panel/layout.tsx");
    expect(layout).toContain("PanelAlertsWatch");
    expect(layout).toContain("PanelAlertDock");
    expect(layout).toContain("FloorAttentionWatch");
  });

  it("realtime manda y el poll es el piso, también para el aviso global", () => {
    const hook = read("src/lib/hooks/usePanelAlerts.ts");
    expect(hook).toContain("subscribeOrders");
    expect(hook).toContain("attachLiveRefresh");
    /* Canal propio: con el mismo nombre se pisa con el de la pantalla de
     * Pedidos y una de las dos suscripciones se queda sin eventos. */
    expect(hook).toContain('":alertas"');
    expect(read("src/lib/data/orders.ts")).toContain("channelSuffix");
  });

  it("Recepción no monta una segunda escucha: publica desde la que ya tenía", () => {
    const watch = read("src/lib/hooks/useWaitlistCancelWatch.ts");
    expect(watch).toContain("publishPanelAlerts");
    expect(watch).toContain("receptionAlerts");
    expect(watch).toContain('event: "INSERT"');
  });

  it("Mesas publica al tablero global y sigue con su propia memoria de visto", () => {
    const hook = read("src/lib/hooks/useFloorAttention.ts");
    expect(hook).toContain("publishPanelAlerts");
    expect(hook).toContain("mesaAlerts");
    expect(hook).toContain("navAckCalls");
    /* El sonido quedó en un solo lugar. */
    expect(hook).not.toContain("dingNew");
    expect(read("src/lib/hooks/usePanelAlerts.ts")).toContain("dingNew");
  });

  it("el aviso global se ve sin bloquear y late fuerte", () => {
    const dock = read("src/components/panel/PanelAlertDock.tsx");
    expect(dock).toContain("u-alert-beat");
    expect(dock).toContain("u-alert-halo");
    expect(dock).toContain("alertIsElsewhere");
    expect(dock).toContain("ackPanelAlerts");
    expect(dock).toContain('aria-live="assertive"');
    /* No es un modal: el mozo tiene que poder seguir con lo suyo. */
    expect(dock).not.toContain("ModalShell");
    expect(dock).not.toContain("inset-0");
  });

  it("las baldosas y las colas de Mesas laten con lo que nadie miró", () => {
    expect(read("src/components/panel/mesas/FloorTableTile.tsx")).toContain("u-alert-beat");
    expect(read("src/components/panel/mesas/KitchenInbox.tsx")).toContain("u-alert-beat");
    expect(read("src/components/panel/mesas/ChargeInbox.tsx")).toContain("u-alert-beat");
    expect(read("src/components/ui/SegmentedTabs.tsx")).toContain("u-alert-beat");
    expect(read("src/app/(app)/panel/pagos/page.tsx")).toContain("tableAlert");
  });
});

/* Mesas atiende al cliente; la comanda del local cocina y entrega.
 *
 * Cuando las dos pantallas ofrecían las mismas transiciones, el mismo pedido
 * tenía dos dueños y el mozo tenía que decidir en cuál tocarlo. El flujo de
 * Mesas es: lo piden → lo anoto → piden la cuenta → cobro. */
describe("Mesas: atender y cobrar, no cocinar", () => {
  const mesas = read("src/app/(app)/panel/pagos/page.tsx");
  const detalle = read("src/components/panel/mesas/TableDetail.tsx");
  const inbox = read("src/components/panel/mesas/KitchenInbox.tsx");

  it("el único paso del pedido en Mesas es «Ya lo anoté»", () => {
    expect(inbox).toContain("mesas.pasarAComanda");
    expect(detalle).toContain("mesas.pasarAComanda");
    expect(detalle).toContain('moveOrder(o, "en_preparacion")');
    /* «Ya lo anoté» es lo que dice el botón, en los dos idiomas. */
    expect(translate("es", "mesas.pasarAComanda")).toBe("Ya lo anoté");
    expect(translate("en", "mesas.pasarAComanda")).toBe("Noted it");
  });

  it("no hay acciones de cocina ni de entrega en ninguna pantalla de Mesas", () => {
    for (const src of [mesas, detalle, inbox, read("src/components/panel/mesas/ChargeInbox.tsx")]) {
      expect(src).not.toContain("marcarListo");
      expect(src).not.toContain("marcarEntregado");
      expect(src).not.toContain('"listo"');
      expect(src).not.toContain('"retirado"');
    }
  });

  it("Pedidos sigue siendo el dueño de preparar, avisar y entregar", () => {
    const card = read("src/components/panel/OrderCard.tsx");
    expect(card).toContain("card.marcarListo");
    expect(card).toContain('"retirado"');
  });

  it("anotar un pedido lo saca del aviso global sin tocar la cuenta", () => {
    const anotado = bill({ orders: [order({ status: "en_preparacion" })] });
    expect(mesaAlerts([anotado], floorAttention([anotado], emptyAttentionSeen(), null))).toEqual([]);
    /* Sigue en la cuenta de la mesa: anotarlo no es cobrarlo. */
    expect(anotado.totals.consumption).toBe(10000);
  });
});


/* La mesa no se "termina" cuando el mozo anota un pedido.
 *
 * «Ya lo anoté» dice una cosa sola: recibí ESTE pedido y lo pasé a la comanda.
 * La mesa sigue viva y puede volver a pedir, llamar y pedir la cuenta, en
 * cualquier orden y las veces que haga falta. Lo que hace que el segundo
 * pedido vuelva a gritar es que el "visto" es por id y se limpia con lo que
 * dejó de estar pendiente — si fuera por mesa, la mesa que ya se miró una vez
 * quedaría muda el resto de la noche. */
describe("Una mesa, muchas novedades: la secuencia de un servicio", () => {
  /* El mismo camino que corre el vigilante: limpiar lo que ya no está,
   * recalcular qué falta mirar y publicar al tablero. */
  const tick = (b: TableBill) => {
    pruneFloorAttention(
      pendingOrderIds([b]),
      pendingBillIds([b]),
      waiterCallSessionIds([b]),
    );
    const att = floorAttention([b], getFloorAttentionState().seen, null);
    publishPanelAlerts("mesas", mesaAlerts([b], att));
    return getLiveAlerts();
  };

  const mesa = (over: Partial<TableBill>) => bill({ ...over, payments: over.payments ?? [] });

  beforeEach(() => {
    /* El "visto" se guarda por sucursal en el dispositivo y sobrevive entre
     * tests: sin limpiarlo, un caso arranca con lo que otro dio por visto. */
    localStorage.clear();
    hydratePanelAlerts(null);
    hydrateFloorAttention(null);
    hydratePanelAlerts("local-1");
    hydrateFloorAttention("local-1");
    publishPanelAlerts("mesas", []);
  });

  it("pedido → anoté → pedido → anoté → llamado → pedido → cuenta → cobrar", () => {
    const o1 = order({ id: "o1", createdAt: "2026-09-16T20:00:00Z" });
    const o2 = order({ id: "o2", createdAt: "2026-09-16T20:20:00Z" });
    const o3 = order({ id: "o3", createdAt: "2026-09-16T20:45:00Z" });

    /* 1. Piden. */
    expect(tick(mesa({ orders: [o1] })).map((a) => a.kind)).toEqual(["pedido-mesa"]);

    /* 2. El mozo lo mira y lo anota: deja de ser novedad, la mesa sigue abierta. */
    cardAckOrders(["o1"]);
    const anotado1 = mesa({ orders: [{ ...o1, status: "en_preparacion" }] });
    expect(tick(anotado1)).toEqual([]);
    expect(anotado1.session.status).toBe("abierta");

    /* 3. Vuelven a pedir. Que la mesa ya se haya mirado no calla al pedido nuevo. */
    const conO2 = mesa({ orders: [{ ...o1, status: "en_preparacion" }, o2] });
    expect(tick(conO2).map((a) => a.id)).toEqual(["pedido-mesa:o2"]);

    /* 4. Además llaman, con el pedido 2 todavía sin anotar. Conviven. */
    const llamando = mesa({
      session: { ...bill().session, calledAt: "2026-09-16T20:30:00Z" },
      orders: [{ ...o1, status: "en_preparacion" }, o2],
    });
    expect(tick(llamando).map((a) => a.kind)).toEqual(["llamado", "pedido-mesa"]);

    /* 5. El mozo va («Ya voy» borra el llamado) y de paso entra el pedido 3. */
    const conO3 = mesa({
      orders: [{ ...o1, status: "en_preparacion" }, o2, o3],
    });
    expect(tick(conO3).map((a) => a.id)).toEqual([
      "pedido-mesa:o3",
      "pedido-mesa:o2",
    ]);

    /* 6. Los anota a los dos. Silencio, pero la mesa sigue consumiendo. */
    cardAckOrders(["o2", "o3"]);
    const todoAnotado = mesa({
      orders: [o1, o2, o3].map((o) => ({ ...o, status: "en_preparacion" as const })),
    });
    expect(tick(todoAnotado)).toEqual([]);
    expect(todoAnotado.session.status).toBe("abierta");

    /* 7. Piden la cuenta. */
    const pidiendoCuenta = mesa({
      orders: [o1, o2, o3].map((o) => ({ ...o, status: "en_preparacion" as const })),
      payments: [pay({ id: "pay1" })],
    });
    expect(tick(pidiendoCuenta).map((a) => a.kind)).toEqual(["cuenta"]);

    /* 8. Cobra. Recién ahí no queda nada que atender. */
    const cobrada = mesa({
      orders: [o1, o2, o3].map((o) => ({ ...o, status: "en_preparacion" as const })),
      payments: [pay({ id: "pay1", status: "pagado" })],
    });
    expect(tick(cobrada)).toEqual([]);
  });

  it("un segundo llamado vuelve a sonar aunque el primero ya se haya atendido", () => {
    const llamada = (at: string | null) =>
      mesa({
        session: { ...bill().session, calledAt: at },
        orders: [order({ status: "en_preparacion" })],
      });

    expect(tick(llamada("2026-09-16T20:10:00Z")).map((a) => a.kind)).toEqual(["llamado"]);
    /* El mozo toca «Ya voy»: la base borra llamado_en. */
    expect(tick(llamada(null))).toEqual([]);
    /* Vuelven a llamar: es una novedad nueva, no un eco de la anterior. */
    expect(tick(llamada("2026-09-16T20:40:00Z")).map((a) => a.kind)).toEqual(["llamado"]);
  });

  it("anotar un pedido no cierra la mesa ni la saca de la cola de cobro", () => {
    const anotada = mesa({
      orders: [order({ status: "en_preparacion" })],
      payments: [pay({ id: "pay1" })],
    });
    const [row] = buildFloor([{ id: "m8", number: 8, qrToken: "t", qrActive: true }], [anotada]);
    /* Sigue en Cobrar: anotar el pedido no tiene nada que ver con la cuenta. */
    expect(kitchenInbox([row]).bills.map((r) => r.tableNumber)).toEqual([8]);
    expect(kitchenInbox([row]).created).toEqual([]);
    expect(row.bill?.session.status).toBe("abierta");
  });
});


/* Mercado Pago: cobro directo, no el QR presencial.
 *
 * Son dos métodos distintos y se confunden fácil. `mercado_pago` es el
 * checkout que paga el cliente desde el celular y confirma el webhook — plata
 * que entró sin que nadie del local tocara nada, y por eso hay que avisar.
 * `qr_mercado_pago` es el QR/POS del mostrador: lo cobra el mozo en la mesa y
 * lo confirma el personal, así que sigue el camino normal de Cobrar. */
describe("Cobro de Mercado Pago confirmado", () => {
  const conMp = (over: Partial<BillPayment> = {}) =>
    bill({
      orders: [order({ status: "en_preparacion" })],
      payments: [pay({ id: "mp1", method: "mercado_pago", status: "pagado", ...over })],
    });

  beforeEach(() => {
    localStorage.clear();
    hydratePanelAlerts(null);
    hydrateFloorAttention(null);
    hydratePanelAlerts("local-1");
    hydrateFloorAttention("local-1");
    publishPanelAlerts("mesas", []);
  });

  it("el pago confirmado por Mercado Pago avisa; el QR presencial no", () => {
    expect(mpPaidIds([conMp()])).toEqual(["mp1"]);
    /* Presencial: lo cobra el mozo, no es una novedad que llegó sola. */
    expect(mpPaidIds([conMp({ method: "qr_mercado_pago" })])).toEqual([]);
    /* Todavía sin confirmar: no entró nada. */
    expect(mpPaidIds([conMp({ status: "pendiente" })])).toEqual([]);
  });

  it("avisa aunque el pago haya cerrado la cuenta en el mismo movimiento", () => {
    /* Cubrir el total pasa la sesión a `pagada`. Si el aviso exigiera sesión
     * abierta, el caso más común no avisaría nunca. */
    const pagada = conMp();
    pagada.session.status = "pagada";
    const alerts = mesaAlerts([pagada], floorAttention([pagada], emptyAttentionSeen(), null));
    expect(alerts.map((a) => a.kind)).toEqual(["mp-pagado"]);
    expect(alerts[0].table).toBe(8);
  });

  it("no se duplica con la cola de Cobrar", () => {
    const b = conMp();
    const att = floorAttention([b], emptyAttentionSeen(), null);
    /* Un pago ya cobrado no es una solicitud de cuenta. */
    expect(att.unseenBillIds).toEqual([]);
    expect(mesaAlerts([b], att).filter((a) => a.kind === "cuenta")).toEqual([]);
  });

  it("es un visto propio: verlo no marca vistos los pedidos ni los llamados", () => {
    const b = conMp();
    const alerts = mesaAlerts([b], floorAttention([b], emptyAttentionSeen(), null));
    publishPanelAlerts("mesas", alerts);
    ackPanelAlerts(alerts);
    const { seen } = getFloorAttentionState();
    expect([...seen.navMp]).toEqual(["mp1"]);
    expect([...seen.cardOrders]).toEqual([]);
    expect([...seen.cardCalls]).toEqual([]);
    /* Visto una vez, no vuelve a gritar. */
    expect(mesaAlerts([b], floorAttention([b], seen, null))).toEqual([]);
  });

  it("no se pierde: el que llama gana, pero el cobro sigue en la cola", () => {
    const llamando = bill({
      session: { ...bill().session, calledAt: "2026-09-16T21:00:00Z" },
      orders: [order({ status: "en_preparacion" })],
      payments: [pay({ id: "mp1", method: "mercado_pago", status: "pagado" })],
    });
    const orden = sortAlerts(
      mesaAlerts([llamando], floorAttention([llamando], emptyAttentionSeen(), null)),
    );
    expect(orden.map((a) => a.kind)).toEqual(["llamado", "mp-pagado"]);
  });
});

/* El dock en hora pico: muchas mesas a la vez.
 *
 * La regla es una sola y es la que importa: nada se da por visto sin que
 * alguien lo abra o lo descarte de a una. Desplegar la cola es mirar. */
describe("Dock con muchas alertas simultáneas", () => {
  const muchas = (n: number) =>
    counterAlerts(
      Array.from({ length: n }, (_, i) => ({
        id: `p${i}`,
        reference: String(i),
        createdAt: `2026-09-16T20:${String(i).padStart(2, "0")}:00Z`,
      })),
    );

  beforeEach(() => {
    localStorage.clear();
    hydratePanelAlerts(null);
    hydratePanelAlerts("local-1");
    publishPanelAlerts("pedidos", []);
  });

  it("las que no entran en las primeras siguen pendientes", () => {
    publishPanelAlerts("pedidos", muchas(8));
    expect(getLiveAlerts()).toHaveLength(8);
    /* Ninguna se cae de la lista ni se marca sola. */
    expect(getLiveAlertCounts().pedidos).toBe(8);
  });

  it("descartar una no toca a las otras siete", () => {
    const todas = muchas(8);
    publishPanelAlerts("pedidos", todas);
    ackPanelAlerts([todas[0]]);
    expect(getLiveAlerts()).toHaveLength(7);
    expect(getLiveAlerts().some((a) => a.id === todas[0].id)).toBe(false);
  });

  it("desplegar la cola no marca nada como visto", () => {
    const dock = read("src/components/panel/PanelAlertDock.tsx");
    /* El botón de la cola solo abre y cierra: si volviera a llamar a
     * ackPanelAlerts, un toque apagaría lo que nadie leyó. */
    const i = dock.indexOf("aria-expanded");
    const cola = dock.slice(i, dock.indexOf("</button>", i));
    expect(cola).toContain("setAbierto");
    expect(cola).not.toContain("ackPanelAlerts");
    /* Y en todo el dock, lo único que marca visto son las dos acciones de la
     * tarjeta: abrirla (va a la sección) y descartarla. Nada masivo. */
    expect(dock.split("ackPanelAlerts([alert])").length - 1).toBe(2);
    expect(dock).not.toContain("ackPanelAlerts(afuera");
    expect(dock).toContain("alertas.pendientesN");
    expect(dock).toContain("alertas.verLasN");
    /* Y la cola desplegada tiene que seguir siendo usable en una tablet. */
    expect(dock).toContain("overflow-y-auto");
  });

  it("el banner de instalar le cede la esquina al dock", () => {
    const banner = read("src/components/pwa/InstallBanner.tsx");
    expect(banner).toContain("usePanelAlerts");
    expect(banner).toContain("alertas.length > 0");
  });
});

/* Cerrar mesa: la acción se hace visible, las reglas no se tocan. */
describe("Cerrar mesa accesible", () => {
  /* La baldosa hace una sola cosa: entrar a la mesa.
   *
   * Tuvo una ✕ para cerrar rápido y se sacó: 32 px pegados al área que el mozo
   * toca todo el día, con el icono que en el resto de la app significa
   * "descartar este aviso". Cerrar se decide mirando la cuenta. */
  it("la baldosa no cierra mesas: solo entra", () => {
    const tile = read("src/components/panel/mesas/FloorTableTile.tsx");
    expect(tile).not.toContain("onClose");
    expect(tile).not.toContain("CloseBtn");
    expect(tile).not.toContain("stopPropagation");
    expect(tile).not.toContain("cerrarMesaN");
    const page = read("src/app/(app)/panel/pagos/page.tsx");
    expect(page).not.toContain("cerrarDesdeMapa");
  });

  it("se cierra desde el detalle, con un solo modal", () => {
    const page = read("src/app/(app)/panel/pagos/page.tsx");
    const detail = read("src/components/panel/mesas/TableDetail.tsx");
    expect(page).toContain("CloseTableModal");
    expect(page).toContain("onCloseTable");
    /* Solo con la mesa abierta, y el modal vive una sola vez, en la página. */
    expect(detail).toContain("{open && onCloseTable && (");
    expect(detail).not.toContain("CloseTableModal");
  });

  it("las validaciones siguen donde estaban", () => {
    const modal = read("src/components/panel/mesas/CloseTableModal.tsx");
    const sql = read("supabase/split-payments.sql");
    const fn = sql.slice(sql.indexOf("function public.cerrar_mesa"), sql.indexOf("function public.regenerar_qr_mesa"));
    /* Servidor: pagos pendientes, encargado y motivo. Nada de esto se tocó. */
    expect(fn).toContain("'pagos-pendientes'");
    expect(fn).toContain("'requiere-encargado'");
    expect(fn).toContain("'motivo-requerido'");
    expect(fn).toContain("auth_gestiona_local");
    expect(fn).toContain("repetido");
    /* UI: el modal sigue bloqueando el envío y explicando por qué. */
    expect(modal).toContain("pending || (uncovered > 0 && !reason.trim())");
    expect(modal).toContain("mesas.error.pagos-pendientes");
  });
});
