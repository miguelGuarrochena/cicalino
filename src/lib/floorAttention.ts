import type { BillOrder, BillPayment, TableBill } from "@/lib/tableBill";

/* Operational "inbox" for the restaurant panel.
 *
 * No extra tables: a table order is new while `pedidos.estado = creado`, and
 * "pedir la cuenta" is a guest payment waiting for the waiter (not Mercado
 * Pago, which confirms itself). Seen/unseen is a panel concern so the same
 * row can later grow a `visto_por_personal_en` without changing this shape. */

export type FloorView = "pedido" | "cobrar" | "todas" | "turno";

export interface AttentionSeen {
  navOrders: ReadonlySet<string>;
  navPayments: ReadonlySet<string>;
  cardOrders: ReadonlySet<string>;
  cardPayments: ReadonlySet<string>;
}

export const emptyAttentionSeen = (): AttentionSeen => ({
  navOrders: new Set(),
  navPayments: new Set(),
  cardOrders: new Set(),
  cardPayments: new Set(),
});

export const openCreatedOrders = (bill: TableBill): BillOrder[] =>
  bill.session.status === "abierta"
    ? bill.orders.filter((o) => o.status === "creado")
    : [];

export const guestBillRequests = (bill: TableBill): BillPayment[] =>
  bill.session.status === "abierta"
    ? bill.payments.filter(
        (p) =>
          p.status === "pendiente" &&
          p.method !== "mercado_pago" &&
          p.createdBy === "comensal",
      )
    : [];

export const pendingOrderIds = (bills: TableBill[]): string[] =>
  bills.flatMap((b) => openCreatedOrders(b).map((o) => o.id));

export const pendingBillIds = (bills: TableBill[]): string[] =>
  bills.flatMap((b) => guestBillRequests(b).map((p) => p.id));

export const waiterCallSessionIds = (bills: TableBill[]): string[] =>
  bills
    .filter((b) => b.session.status === "abierta" && b.session.calledAt)
    .map((b) => b.session.id);

const unseenIn = (ids: string[], seen: ReadonlySet<string>): string[] =>
  ids.filter((id) => !seen.has(id));

export const withIds = (
  seen: ReadonlySet<string>,
  ids: Iterable<string>,
): Set<string> => {
  const next = new Set(seen);
  for (const id of ids) next.add(id);
  return next;
};

export const pruneSeen = (
  seen: AttentionSeen,
  orderIds: string[],
  paymentIds: string[],
): AttentionSeen => {
  const orders = new Set(orderIds);
  const payments = new Set(paymentIds);
  const keep = (set: ReadonlySet<string>, live: Set<string>) =>
    new Set([...set].filter((id) => live.has(id)));
  return {
    navOrders: keep(seen.navOrders, orders),
    navPayments: keep(seen.navPayments, payments),
    cardOrders: keep(seen.cardOrders, orders),
    cardPayments: keep(seen.cardPayments, payments),
  };
};

export interface FloorAttention {
  pendingOrders: number;
  pendingBills: number;
  waiterCalls: number;
  waiterCallIds: string[];
  unseenOrders: number;
  unseenBills: number;
  headerUnseen: number;
  headerPriority: boolean;
  tabPedidoPulse: boolean;
  tabCobrarPulse: boolean;
  unseenOrderIds: string[];
  unseenBillIds: string[];
  newOrderIds: string[];
  newBillIds: string[];
  headerKeys: string[];
}

export const floorAttention = (
  bills: TableBill[],
  seen: AttentionSeen,
  view: FloorView | null,
): FloorAttention => {
  const orderIds = pendingOrderIds(bills);
  const billIds = pendingBillIds(bills);
  const calls = waiterCallSessionIds(bills);
  const unseenOrderIds = unseenIn(orderIds, seen.navOrders);
  const unseenBillIds = unseenIn(billIds, seen.navPayments);
  const newOrderIds = unseenIn(orderIds, seen.cardOrders);
  const newBillIds = unseenIn(billIds, seen.cardPayments);
  const onPedido = view === "pedido";
  const onCobrar = view === "cobrar";
  const headerOrders = onPedido ? 0 : unseenOrderIds.length + calls.length;
  const headerBills = onCobrar ? 0 : unseenBillIds.length;

  const headerKeys = [
    ...(onPedido ? [] : unseenOrderIds.map((id) => `o:${id}`)),
    ...(onPedido ? [] : calls.map((id) => `c:${id}`)),
    ...(onCobrar ? [] : unseenBillIds.map((id) => `p:${id}`)),
  ];

  return {
    pendingOrders: orderIds.length,
    pendingBills: billIds.length,
    waiterCalls: calls.length,
    waiterCallIds: calls,
    unseenOrders: unseenOrderIds.length,
    unseenBills: unseenBillIds.length,
    headerUnseen: headerOrders + headerBills,
    headerPriority: headerBills > 0,
    tabPedidoPulse: !onPedido && (unseenOrderIds.length > 0 || calls.length > 0),
    tabCobrarPulse: !onCobrar && unseenBillIds.length > 0,
    unseenOrderIds,
    unseenBillIds,
    newOrderIds,
    newBillIds,
    headerKeys,
  };
};

export const idsForTable = (
  bill: TableBill | null,
): { orders: string[]; payments: string[] } => {
  if (!bill) return { orders: [], payments: [] };
  return {
    orders: openCreatedOrders(bill).map((o) => o.id),
    payments: guestBillRequests(bill).map((p) => p.id),
  };
};
