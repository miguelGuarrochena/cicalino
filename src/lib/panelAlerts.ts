import type { TableBill } from "@/lib/tableBill";
import type { FloorAttention } from "@/lib/floorAttention";
import type { OrderView, WaitlistView } from "@/lib/types";

/* Capa de comunicación del panel: un solo lugar donde entran las novedades de
 * todos los módulos y del que salen las alertas que se ven en cualquier
 * pantalla.
 *
 * El problema que resuelve no es de datos sino de ubicación. Cada módulo ya
 * escuchaba lo suyo, pero solo mientras el empleado estaba parado en esa
 * sección: si el mozo estaba en Configuración, la mesa 4 podía llamar durante
 * diez minutos sin que nadie se enterara. Acá los módulos publican y la capa
 * global muestra, así la navegación deja de decidir si te enterás.
 *
 * Es deliberadamente tonta: no consulta nada ni guarda estado. Cada fuente le
 * pasa lo que ya tiene cargado (Mesas sus cuentas, Pedidos sus pedidos,
 * Recepción su lista) y esto lo normaliza a una forma común. Sumar un evento
 * nuevo mañana es agregar un `kind` y una función `...Alerts` — no otro
 * mecanismo de notificación. */

export type PanelAlertSource = "mesas" | "pedidos" | "recepcion";

export type PanelAlertKind =
  | "llamado"
  | "pedido-mesa"
  | "cuenta"
  | "pedido-mostrador"
  | "espera-nueva";

export interface PanelAlert {
  /* Estable entre refrescos: es lo que decide si algo ya se vio y si hay que
   * sonar. Lleva el tipo adelante para que dos fuentes no choquen. */
  id: string;
  kind: PanelAlertKind;
  source: PanelAlertSource;
  /* A dónde lleva tocar la alerta. El detalle sigue siendo de su sección. */
  href: string;
  at: string;
  table: number | null;
  label: string | null;
}

interface KindMeta {
  source: PanelAlertSource;
  href: string;
  /* Más alto manda: primero lo que deja a alguien esperando en la mesa. */
  priority: number;
  /* Clave de i18n del título, y el emoji que se ve de lejos. */
  titleKey: string;
  icon: string;
}

export const ALERT_META: Record<PanelAlertKind, KindMeta> = {
  llamado: {
    source: "mesas",
    href: "/panel/mesas",
    priority: 4,
    titleKey: "alertas.llamado",
    icon: "🔔",
  },
  cuenta: {
    source: "mesas",
    href: "/panel/mesas",
    priority: 3,
    titleKey: "alertas.cuenta",
    icon: "💳",
  },
  "pedido-mesa": {
    source: "mesas",
    href: "/panel/mesas",
    priority: 2,
    titleKey: "alertas.pedidoMesa",
    icon: "🍽️",
  },
  "pedido-mostrador": {
    source: "pedidos",
    href: "/panel/pedidos",
    priority: 1,
    titleKey: "alertas.pedidoMostrador",
    icon: "🧾",
  },
  "espera-nueva": {
    source: "recepcion",
    href: "/panel/espera",
    priority: 1,
    titleKey: "alertas.esperaNueva",
    icon: "👋",
  },
};

export const alertPriority = (a: PanelAlert): number =>
  ALERT_META[a.kind].priority;

const build = (
  kind: PanelAlertKind,
  id: string,
  at: string | null,
  table: number | null,
  label: string | null,
): PanelAlert => ({
  id: `${kind}:${id}`,
  kind,
  source: ALERT_META[kind].source,
  href: ALERT_META[kind].href,
  at: at ?? "",
  table,
  label,
});

/* Mesas ya tiene su propia memoria de "visto" (attention-store), con dos
 * niveles: entrar a la sección y abrir la mesa. Por eso acá no se vuelve a
 * filtrar: se publican las mismas claves que ya decidían la campanita del
 * header (`headerKeys`), que también saben qué pestaña está abierta. */
export const mesaAlerts = (
  bills: TableBill[],
  attention: FloorAttention,
): PanelAlert[] => {
  const keys = new Set(attention.headerKeys);
  if (!keys.size) return [];
  const out: PanelAlert[] = [];

  for (const b of bills) {
    const n = b.session.tableNumber;
    if (keys.has(`c:${b.session.id}`)) {
      out.push(build("llamado", b.session.id, b.session.calledAt, n, null));
    }
    for (const o of b.orders) {
      if (!keys.has(`o:${o.id}`)) continue;
      out.push(build("pedido-mesa", o.id, o.createdAt, n, null));
    }
    for (const p of b.payments) {
      if (!keys.has(`p:${p.id}`)) continue;
      out.push(build("cuenta", p.id, p.createdAt, n, p.payerName));
    }
  }
  return out;
};

/* Pedidos y Recepción alcanzan con estos campos. Va acotado para que el
 * vigilante global pueda leer poco y no arrastre la página entera de una
 * sección en la que el empleado ni siquiera está. */
export type CounterOrderRef = Pick<OrderView, "id" | "reference" | "createdAt">;
export type WaitingPartyRef = Pick<
  WaitlistView,
  "id" | "name" | "status" | "createdAt"
>;

/* Pedidos: la cola del mostrador. Lo que importa avisar afuera de la sección
 * es el pedido que todavía nadie pasó a la cocina. */
export const counterAlerts = (orders: CounterOrderRef[]): PanelAlert[] =>
  orders.map((o) =>
    build("pedido-mostrador", o.id, o.createdAt, null, o.reference),
  );

/* Recepción: alguien nuevo en la lista. La cancelación del cliente ya tiene
 * su propio popup bloqueante (EsperaCancelWatch) y no se duplica acá. */
export const receptionAlerts = (esperas: WaitingPartyRef[]): PanelAlert[] =>
  esperas
    .filter((e) => e.status === "esperando")
    .map((e) => build("espera-nueva", e.id, e.createdAt, null, e.name));

/* Lo urgente primero y, dentro de lo mismo, lo más reciente arriba. */
export const sortAlerts = (alerts: PanelAlert[]): PanelAlert[] =>
  [...alerts].sort((a, b) => {
    const p = alertPriority(b) - alertPriority(a);
    if (p !== 0) return p;
    return b.at.localeCompare(a.at);
  });

export const unseenAlerts = (
  alerts: PanelAlert[],
  seen: ReadonlySet<string>,
): PanelAlert[] => alerts.filter((a) => !seen.has(a.id));

export const alertsBySource = (
  alerts: PanelAlert[],
): Record<PanelAlertSource, number> => {
  const counts: Record<PanelAlertSource, number> = {
    mesas: 0,
    pedidos: 0,
    recepcion: 0,
  };
  for (const a of alerts) counts[a.source] += 1;
  return counts;
};

/* Qué llegó desde la última vez. Es lo que decide el sonido: si suena por
 * "hay pendientes" en vez de por "llegó algo", el mostrador escucha un beep
 * cada refresco hasta que alguien atiende. */
export const arrivedIds = (
  before: ReadonlySet<string>,
  after: PanelAlert[],
): string[] => after.map((a) => a.id).filter((id) => !before.has(id));

export const topAlert = (alerts: PanelAlert[]): PanelAlert | null =>
  sortAlerts(alerts)[0] ?? null;

/* La pantalla que ya está abierta no necesita que le griten: muestra el
 * detalle. Se compara exacto y no por prefijo a propósito — /panel/mesas/qr
 * está "dentro de Mesas" pero es la pantalla de imprimir códigos, y ahí el
 * llamado de la mesa 4 no se ve por ningún lado. */
export const alertIsElsewhere = (a: PanelAlert, path: string): boolean =>
  path !== a.href;
