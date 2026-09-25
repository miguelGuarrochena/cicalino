import type { OrderStatus } from "@/lib/types";
import { enabledMethods, type PaymentMethod, type PaymentSettings } from "@/lib/tableBill";

/* Pedidos hechos desde un QR, del lado del cliente y de la caja.
 *
 * Dos modalidades con la misma base:
 *   autoservicio  (Mesa) la mesa no tiene mozo: el cliente pide desde el QR
 *                 de su mesa, paga y recién ahí se prepara.
 *   mostrador_qr  (Mostrador QR) un QR para todo el local: el pedido entra a
 *                 preparación enseguida y se paga ahora (Mercado Pago) o al
 *                 retirar (en caja).
 * Las reglas viven en la base (supabase/pedidos-mesa.sql y
 * pedidos-mostrador-qr.sql); esto solo traduce lo que devuelve a algo que una
 * pantalla pueda mostrar. */

export type PickupPayChoice = "caja" | "mercado_pago";

export type PickupFlow = "autoservicio" | "mostrador_qr";

/* Lo que ve el cliente. Son cuatro estados y nada más: el resto de los que
 * tiene el pedido (creado, en_preparacion) son detalle del mostrador. */
export type PickupStage =
  | "esperando-pago"
  | "recibido"
  | "en-preparacion"
  | "listo"
  | "retirado"
  | "cancelado";

export interface PickupItem {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface PickupPayment {
  id: string;
  method: PaymentMethod;
  status: "pendiente" | "pagado" | "cancelado" | "definido";
  total: number;
  expiresAt: string | null;
  mpStatus: string | null;
  confirmedAt: string | null;
  createdBy: "comensal" | "personal";
}

export interface PickupOrder {
  id: string;
  reference: string;
  alias: string | null;
  status: OrderStatus;
  flow: PickupFlow;
  tableNumber: number | null;
  guestId: string | null;
  createdAt: string;
  confirmedAt: string | null;
  readyAt: string | null;
  pickedUpAt: string | null;
  cancelledAt: string | null;
  notifiedAt: string | null;
  /* El cliente eligió pagar en caja: es el aviso que ve la caja. */
  payAtCounterAt: string | null;
  total: number;
  items: PickupItem[];
  payment: PickupPayment | null;
}

/* Un pedido de otra persona de la misma mesa: sin ítems ni nombres, solo lo
 * necesario para que quien vuelve a escanear reconozca el suyo. */
export interface TablePickupSummary {
  reference: string;
  status: OrderStatus;
  createdAt: string;
  total: number;
}

export interface PickupState {
  flow: PickupFlow;
  /* La mesa del QR. En el mostrador no hay. */
  table: { id: string; number: number } | null;
  /* El local (Mostrador QR). */
  branch: { id: string; name: string } | null;
  operational: boolean;
  /* Mostrador QR: false si se entró con un QR regenerado. Se siguen viendo
   * (y pagando) los pedidos del teléfono, pero no se inicia uno nuevo. */
  qrValid: boolean;
  /* Mostrador QR: se entró por el link de un pedido (el push de "listo"). */
  orderLink: boolean;
  guest: { id: string; name: string; sessionId: string } | null;
  /* Puede seguir pidiendo con esta identidad (su sesión es la de hoy). */
  canOrder: boolean;
  orders: PickupOrder[];
  tableOrders: TablePickupSummary[];
}

type Json = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const ORDER_STATUSES: readonly OrderStatus[] = [
  "pendiente_pago",
  "creado",
  "en_preparacion",
  "listo",
  "retirado",
  "cancelado",
];

const orderStatus = (v: unknown): OrderStatus =>
  ORDER_STATUSES.includes(v as OrderStatus) ? (v as OrderStatus) : "creado";

const mapPayment = (raw: unknown): PickupPayment | null => {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Json;
  if (!str(g.id)) return null;
  return {
    id: String(g.id),
    method: String(g.metodo) as PaymentMethod,
    status: (str(g.estado) ?? "pendiente") as PickupPayment["status"],
    total: num(g.monto_total),
    expiresAt: str(g.expira_en),
    mpStatus: str(g.mp_estado),
    confirmedAt: str(g.confirmado_en),
    createdBy: g.creado_por === "personal" ? "personal" : "comensal",
  };
};

export const mapPickupOrder = (raw: unknown): PickupOrder | null => {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Json;
  if (!str(p.id)) return null;
  const items = Array.isArray(p.items) ? (p.items as Json[]) : [];
  return {
    id: String(p.id),
    reference: String(p.referencia ?? ""),
    alias: str(p.alias),
    status: orderStatus(p.estado),
    flow: p.flujo === "mostrador_qr" ? "mostrador_qr" : "autoservicio",
    tableNumber: p.mesa_numero == null ? null : num(p.mesa_numero),
    guestId: str(p.comensal_id),
    createdAt: String(p.creado_en ?? ""),
    confirmedAt: str(p.confirmado_en),
    readyAt: str(p.listo_en),
    pickedUpAt: str(p.retirado_en),
    cancelledAt: str(p.cancelado_en),
    notifiedAt: str(p.avisado_en),
    payAtCounterAt: str(p.pago_caja_en),
    total: num(p.total),
    items: items.map((i) => ({
      id: String(i.id ?? `${i.nombre}`),
      name: String(i.nombre ?? ""),
      unitPrice: num(i.precio_unitario),
      quantity: num(i.cantidad),
      subtotal: num(i.subtotal),
    })),
    payment: mapPayment(p.pago),
  };
};

export const mapPickupOrders = (raw: unknown): PickupOrder[] =>
  Array.isArray(raw)
    ? raw.map(mapPickupOrder).filter((o): o is PickupOrder => o !== null)
    : [];

export const mapPickupState = (raw: unknown): PickupState | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Json;
  if (r.ok === false) return null;
  const mesa = (r.mesa ?? {}) as Json;
  const local = (r.local ?? {}) as Json;
  /* La mesa (modalidad Mesa) o el local (Mostrador QR): uno de los dos. */
  if (!str(mesa.id) && !str(local.id)) return null;
  const c = r.comensal as Json | null | undefined;
  const tableOrders = Array.isArray(r.mesa_pedidos) ? (r.mesa_pedidos as Json[]) : [];
  return {
    flow: str(mesa.id) ? "autoservicio" : "mostrador_qr",
    table: str(mesa.id) ? { id: String(mesa.id), number: num(mesa.numero) } : null,
    branch: str(local.id) ? { id: String(local.id), name: String(local.nombre ?? "") } : null,
    operational: r.operativo !== false,
    qrValid: r.qr_vigente !== false,
    orderLink: r.pedido_link === true,
    guest:
      c && str(c.id)
        ? { id: String(c.id), name: String(c.nombre ?? ""), sessionId: String(c.sesion_id ?? "") }
        : null,
    canOrder: Boolean(r.sesion_abierta),
    orders: mapPickupOrders(r.pedidos),
    tableOrders: tableOrders.map((o) => ({
      reference: String(o.referencia ?? ""),
      status: orderStatus(o.estado),
      createdAt: String(o.creado_en ?? ""),
      total: num(o.total),
    })),
  };
};

/* En el mostrador el pedido recién hecho se ve "Recibido": entró, todavía
 * nadie lo empezó. En la mesa `creado` ya es "pago y en la cola". */
export const pickupStage = (status: OrderStatus, flow: PickupFlow = "autoservicio"): PickupStage => {
  if (status === "pendiente_pago") return "esperando-pago";
  if (status === "creado" && flow === "mostrador_qr") return "recibido";
  if (status === "listo") return "listo";
  if (status === "retirado") return "retirado";
  if (status === "cancelado") return "cancelado";
  return "en-preparacion";
};

/* Lo que todavía está en juego: se muestra arriba y con el estado grande. */
export const pickupActive = (status: OrderStatus): boolean =>
  status !== "retirado" && status !== "cancelado";

/* Cómo está pagando un pedido que sigue esperando. `mercado_pago` solo si el
 * checkout sigue abierto: uno vencido o rechazado deja elegir de nuevo. */
export type PickupPaying = "caja" | "mercado_pago" | "sin-elegir";

export const pickupPaying = (o: PickupOrder, now: number = Date.now()): PickupPaying => {
  if (o.status !== "pendiente_pago") return "sin-elegir";
  const p = o.payment;
  if (
    p &&
    p.method === "mercado_pago" &&
    p.status === "pendiente" &&
    (!p.expiresAt || new Date(p.expiresAt).getTime() > now)
  ) {
    return "mercado_pago";
  }
  if (o.payAtCounterAt) return "caja";
  return "sin-elegir";
};

/* El cobro de Mercado Pago se rechazó o venció sin aprobarse. */
export const pickupPaymentFailed = (o: PickupOrder): boolean =>
  o.status === "pendiente_pago" &&
  !o.payAtCounterAt &&
  o.payment?.method === "mercado_pago" &&
  o.payment.status === "cancelado";

/* ¿Cuáles acaban de pasar a listo? Es lo que hace sonar el teléfono. Solo
 * cuenta un cambio visto en vivo: al abrir la pantalla con un pedido que ya
 * estaba listo no suena. */
export const newlyReady = (
  before: ReadonlyMap<string, OrderStatus>,
  orders: PickupOrder[],
): string[] =>
  orders
    .filter((o) => o.status === "listo")
    .filter((o) => {
      const prev = before.get(o.id);
      return prev !== undefined && prev !== "listo";
    })
    .map((o) => o.id);

/* Los pedidos para la caja, con el aviso de "paga en caja" arriba. */
export const sortToCharge = (orders: PickupOrder[]): PickupOrder[] =>
  [...orders].sort((a, b) => {
    const ac = a.payAtCounterAt ? 0 : 1;
    const bc = b.payAtCounterAt ? 0 : 1;
    if (ac !== bc) return ac - bc;
    return (a.payAtCounterAt ?? a.createdAt).localeCompare(b.payAtCounterAt ?? b.createdAt);
  });

/* ---- Mostrador QR: el pago va aparte de la preparación ------------------
 *
 * El pedido está en el tablero desde que se hizo; lo que cambia es si ya se
 * cobró y cómo. Uno pago no vuelve a pagarse (lo impide la base). */
export type CounterPayState =
  | "pagado"
  | "mercado_pago" /* en el checkout ahora mismo */
  | "caja" /* paga al retirar */
  | "sin-pagar"; /* Mercado Pago no se completó y no eligió caja */

export const counterPayState = (o: PickupOrder, now: number = Date.now()): CounterPayState => {
  const p = o.payment;
  if (p?.status === "pagado") return "pagado";
  if (
    p &&
    p.method === "mercado_pago" &&
    p.status === "pendiente" &&
    (!p.expiresAt || new Date(p.expiresAt).getTime() > now)
  ) {
    return "mercado_pago";
  }
  if (o.payAtCounterAt) return "caja";
  return "sin-pagar";
};

/* Qué formas de pago ofrece el mostrador, desde la configuración real del
 * local (mismo criterio que _mostrador_caja_habilitada en la base):
 *   mercadoPago  método propio: habilitado y con la cuenta conectada.
 *   caja         NO es un método: pagar al retirar, en persona, con alguno de
 *                los otros habilitados (efectivo, tarjetas, transferencia, QR).
 * Sin ninguno de los dos, Mostrador QR no toma pedidos. */
export const counterPayOptions = (
  settings: PaymentSettings,
  mercadoPagoReady: boolean,
): { caja: boolean; mercadoPago: boolean } => ({
  caja: enabledMethods(settings, { mercadoPagoConnected: false, forStaff: true }).length > 0,
  mercadoPago: mercadoPagoReady,
});

/* ¿Se puede cambiar cómo paga? Mientras no esté pago ni retirado/cancelado. */
export const counterCanPay = (o: PickupOrder): boolean =>
  o.status !== "cancelado" && o.status !== "retirado" && counterPayState(o) !== "pagado";

