import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { kitchenSection, type KitchenQueueItem } from "@/lib/kitchen";
import {
  alertIsElsewhere,
  kitchenAlerts,
  loudAlerts,
} from "@/lib/panelAlerts";
import {
  ackPanelAlerts,
  ackPanelSource,
  getLiveAlertCounts,
  getLiveAlerts,
  hydratePanelAlerts,
  publishPanelAlerts,
} from "@/lib/store/panel-alert-store";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/* Una comanda en cocina tal como la devuelve fetchKitchenQueue. */
const comanda = (over: Partial<KitchenQueueItem> & { id: string }): KitchenQueueItem => ({
  reference: over.id,
  createdAt: "2026-10-20T20:00:00Z",
  doneAt: null,
  tableNumber: null,
  where: "pedidos",
  ...over,
});

const hecha = (c: KitchenQueueItem): KitchenQueueItem => ({
  ...c,
  doneAt: "2026-10-20T20:15:00Z",
});

/* Lo que corre el vigilante en cada refresco: publicar la cola entera. */
const tick = (cola: KitchenQueueItem[]) => {
  publishPanelAlerts("cocina", kitchenAlerts(cola));
  return getLiveAlertCounts();
};

describe("A qué sección vuelve la comanda: el flujo de la sesión", () => {
  it("sin sesión es del mostrador", () => {
    expect(kitchenSection({ sessionId: null, flow: null, selfService: false })).toBe("pedidos");
  });

  it("la cuenta compartida de la mesa es Pagos", () => {
    expect(kitchenSection({ sessionId: "s1", flow: "cuenta", selfService: false })).toBe("pagos");
  });

  it("Pedidos Mesa y el Mostrador QR son Pedidos, aunque tengan mesa", () => {
    expect(kitchenSection({ sessionId: "s1", flow: "autoservicio", selfService: true })).toBe("pedidos");
    expect(kitchenSection({ sessionId: "s1", flow: "mostrador_qr", selfService: true })).toBe("pedidos");
  });

  it("manda el flujo de la sesión, no el número de mesa", () => {
    /* Las dos son "Mesa 4": lo que cambia es el flujo. */
    const pagos = comanda({ id: "a", tableNumber: 4, where: kitchenSection({ sessionId: "s1", flow: "cuenta", selfService: false }) });
    const mesa = comanda({ id: "b", tableNumber: 4, where: kitchenSection({ sessionId: "s2", flow: "autoservicio", selfService: true }) });
    const [aPagos, aPedidos] = kitchenAlerts([hecha(pagos), hecha(mesa)]);
    expect(aPagos.source).toBe("mesas");
    expect(aPagos.href).toBe("/panel/pagos");
    expect(aPedidos.source).toBe("pedidos");
    expect(aPedidos.href).toBe("/panel/pedidos");
  });

  it("si la sesión no vino en la lectura, decide autoservicio, como el tablero de Pedidos", () => {
    expect(kitchenSection({ sessionId: "s1", flow: null, selfService: false })).toBe("pagos");
    expect(kitchenSection({ sessionId: "s1", flow: null, selfService: true })).toBe("pedidos");
  });

  it("la lectura trae el flujo de la sesión y lo usa para decidir", () => {
    const orders = read("src/lib/data/orders.ts");
    expect(orders).toContain("mesa_sesiones(mesa_numero, flujo)");
    expect(orders).toContain("kitchenSection({");
    expect(orders).not.toContain('r.sesion_id && !r.autoservicio ? "pagos"');
  });
});

describe("Contadores de Cocina, Pagos y Pedidos a lo largo de una comanda", () => {
  beforeEach(() => {
    localStorage.clear();
    hydratePanelAlerts(null);
    hydratePanelAlerts("local-1");
    publishPanelAlerts("mesas", []);
    publishPanelAlerts("pedidos", []);
    publishPanelAlerts("recepcion", []);
    publishPanelAlerts("cocina", []);
  });

  it("mesa de Pagos: entra a Cocina, cocina la termina y Pagos la lleva", () => {
    const c = comanda({ id: "o1", tableNumber: 4, where: "pagos" });

    expect(tick([])).toMatchObject({ cocina: 0, mesas: 0, pedidos: 0 });
    /* El mozo la manda: suma a Cocina, a nadie más. */
    expect(tick([c])).toMatchObject({ cocina: 1, mesas: 0, pedidos: 0 });
    /* Cocina la marca hecha: sale de Cocina y entra a Pagos, no a Pedidos. */
    expect(tick([hecha(c)])).toMatchObject({ cocina: 0, mesas: 1, pedidos: 0 });
    /* El mozo marca listo al llevarla: deja de estar en cocina. */
    expect(tick([])).toMatchObject({ cocina: 0, mesas: 0, pedidos: 0 });
  });

  it("Pedidos Mesa: entra a Cocina, cocina la termina y Pedidos la lleva", () => {
    const c = comanda({ id: "o2", tableNumber: 4, where: "pedidos" });

    expect(tick([c])).toMatchObject({ cocina: 1, mesas: 0, pedidos: 0 });
    expect(tick([hecha(c)])).toMatchObject({ cocina: 0, mesas: 0, pedidos: 1 });
    expect(tick([])).toMatchObject({ cocina: 0, mesas: 0, pedidos: 0 });
  });

  it("cancelar una comanda en cocina la saca del contador", () => {
    const c = comanda({ id: "o3" });
    expect(tick([c]).cocina).toBe(1);
    expect(tick([]).cocina).toBe(0);
  });

  it("varias a la vez: cada una cuenta una sola vez y en un solo globo", () => {
    const pagos = comanda({ id: "p", tableNumber: 2, where: "pagos" });
    const mesa = comanda({ id: "m", tableNumber: 5, where: "pedidos" });
    const mostrador = comanda({ id: "x", reference: "14", where: "pedidos" });

    expect(tick([pagos, mesa, mostrador])).toMatchObject({ cocina: 3, mesas: 0, pedidos: 0 });
    expect(tick([hecha(pagos), mesa, mostrador])).toMatchObject({ cocina: 2, mesas: 1, pedidos: 0 });
    expect(tick([hecha(pagos), hecha(mesa), mostrador])).toMatchObject({ cocina: 1, mesas: 1, pedidos: 1 });
    expect(tick([hecha(pagos), hecha(mesa), hecha(mostrador)])).toMatchObject({ cocina: 0, mesas: 1, pedidos: 2 });
    /* Pagos llevó la suya; las de Pedidos siguen. */
    expect(tick([hecha(mesa), hecha(mostrador)])).toMatchObject({ cocina: 0, mesas: 0, pedidos: 2 });
  });

  it("el mismo refresco repetido (realtime + poll) no acumula", () => {
    const cola = [comanda({ id: "a" }), comanda({ id: "b" })];
    tick(cola);
    tick(cola);
    tick(cola);
    expect(getLiveAlertCounts().cocina).toBe(2);
    expect(getLiveAlerts().filter((a) => a.kind === "cocina-nueva")).toHaveLength(2);
  });

  it("convive con lo del mostrador sin pisarlo: son fuentes distintas", () => {
    publishPanelAlerts("pedidos", [
      { id: "pedido-mostrador:z", kind: "pedido-mostrador", source: "pedidos", href: "/panel/pedidos", at: "", table: null, label: "9" },
    ]);
    expect(tick([hecha(comanda({ id: "m", where: "pedidos" }))])).toMatchObject({ pedidos: 2 });
    /* Un refresco de cocina vacío no se lleva el pedido del mostrador. */
    expect(tick([])).toMatchObject({ pedidos: 1 });
  });

  it("estar en Pedidos no apaga lo que cocina terminó ni lo que hay que preparar", () => {
    tick([comanda({ id: "a" }), hecha(comanda({ id: "b", where: "pedidos" }))]);
    /* Lo mismo que hace useSectionAck en /panel/pedidos. */
    ackPanelAlerts(
      getLiveAlerts().filter((a) => a.source === "pedidos" && a.kind !== "cocina-lista"),
    );
    ackPanelSource("recepcion");
    expect(getLiveAlertCounts()).toMatchObject({ cocina: 1, pedidos: 1 });
  });

  it("el contador de Cocina sigue el estado real: no se apaga por mirarlo", () => {
    tick([comanda({ id: "a" })]);
    expect(getLiveAlertCounts().cocina).toBe(1);
    /* Solo baja cuando cocina la marca hecha. */
    expect(tick([hecha(comanda({ id: "a" }))]).cocina).toBe(0);
  });
});

describe("Cocina nueva: solo el globo", () => {
  it("no sale en el dock ni suena; lo hecho sí", () => {
    const alerts = kitchenAlerts([
      comanda({ id: "a" }),
      hecha(comanda({ id: "b", tableNumber: 3, where: "pagos" })),
    ]);
    expect(loudAlerts(alerts).map((a) => a.kind)).toEqual(["cocina-lista"]);
    const hook = read("src/lib/hooks/usePanelAlerts.ts");
    expect(hook).toContain("return loudAlerts(getLiveAlerts())");
    expect(hook).toContain("const alerts = loudAlerts(getLiveAlerts())");
  });

  it("lo hecho no se repite en su sección ni en Cocina", () => {
    const [nueva, lista] = kitchenAlerts([
      comanda({ id: "a" }),
      hecha(comanda({ id: "b", tableNumber: 3, where: "pagos" })),
    ]);
    expect(nueva.href).toBe("/panel/cocina");
    expect(alertIsElsewhere(lista, "/panel/pagos")).toBe(false);
    expect(alertIsElsewhere(lista, "/panel/cocina")).toBe(false);
    expect(alertIsElsewhere(lista, "/panel/pedidos")).toBe(true);
  });
});

describe("Cableado de los contadores", () => {
  const hook = read("src/lib/hooks/usePanelAlerts.ts");

  it("cocina tiene su propia escucha, con Pedidos o con Pagos", () => {
    expect(hook).toContain("useKitchenAlertsFeed();");
    expect(hook).toContain("fetchKitchenQueue");
    expect(hook).toContain('":alertas-cocina"');
    expect(hook).toContain("(visibles.pedidos || visibles.pagos)");
    expect(hook).toContain('publishPanelAlerts("cocina", kitchenAlerts(res.data))');
  });

  it("Pedidos ya no publica lo de cocina en su fuente", () => {
    expect(hook).not.toContain("fetchReadyForCounter");
    expect(hook).not.toContain("cocinaListaAlerts");
  });

  it("Cocina lee su fuente; Pagos suma comandas y cobros, y late si cocina terminó un plato", () => {
    const nav = read("src/lib/hooks/useNavPending.ts");
    expect(nav).toContain('"/panel/cocina": "cocina"');
    /* El plato listo sigue despertando el globo. No entra en el número:
     * Pagos tiene que ser exactamente Comandas + Cobrar. */
    expect(nav).toContain('a.kind === "cocina-lista" && a.source === "mesas"');
    expect(nav).toContain("comandas + cobrar");
    expect(nav).not.toContain("headerUnseen + hechasMesa");
  });
});
