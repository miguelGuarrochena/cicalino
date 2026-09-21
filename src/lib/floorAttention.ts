import { excessPayments, type BillOrder, type BillPayment, type TableBill } from "@/lib/tableBill";

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
  navCalls: ReadonlySet<string>;
  navMp: ReadonlySet<string>;
  cardOrders: ReadonlySet<string>;
  cardPayments: ReadonlySet<string>;
  cardCalls: ReadonlySet<string>;
  cardMp: ReadonlySet<string>;
}

export const emptyAttentionSeen = (): AttentionSeen => ({
  navOrders: new Set(),
  navPayments: new Set(),
  navCalls: new Set(),
  navMp: new Set(),
  cardOrders: new Set(),
  cardPayments: new Set(),
  cardCalls: new Set(),
  cardMp: new Set(),
});

export const openCreatedOrders = (bill: TableBill): BillOrder[] =>
  bill.session.status === "abierta"
    ? bill.orders.filter((o) => o.status === "creado")
    : [];

export const guestBillRequests = (bill: TableBill): BillPayment[] => {
  const excess = excessPayments(bill);
  if (bill.session.status === "pagada") return excess;
  if (bill.session.status !== "abierta") return [];
  /* After the table asked for the bill, the restaurant gets one request with
   * every defined share — including Mercado Pago, which still charges later. */
  const requested = bill.session.requestedAt
    ? bill.payments.filter(
        (p) =>
          p.createdBy === "comensal" &&
          (p.status === "pendiente" || p.status === "pagado"),
      )
    : bill.payments.filter(
        (p) =>
          p.status === "pendiente" &&
          p.method !== "mercado_pago" &&
          p.createdBy === "comensal",
      );
  const seen = new Set(requested.map((p) => p.id));
  return [...requested, ...excess.filter((p) => !seen.has(p.id))];
};

export const pendingOrderIds = (bills: TableBill[]): string[] =>
  bills.flatMap((b) => openCreatedOrders(b).map((o) => o.id));

export const pendingBillIds = (bills: TableBill[]): string[] =>
  bills.flatMap((b) => guestBillRequests(b).map((p) => p.id));

export const waiterCallSessionIds = (bills: TableBill[]): string[] =>
  bills
    .filter((b) => b.session.status === "abierta" && b.session.calledAt)
    .map((b) => b.session.id);

/* Cobro directo por Mercado Pago, ya confirmado por el webhook.
 *
 * Dos aclaraciones que importan y que se confunden fácil:
 *
 *  · `mercado_pago` es el checkout que paga el cliente desde el celular y
 *    confirma Mercado Pago. `qr_mercado_pago` es el QR/POS del local, que
 *    cobra el mozo en la mesa y confirma el personal — ese es presencial y no
 *    entra acá.
 *  · No se pide que la sesión siga abierta. Un pago que cubre todo la pasa a
 *    `pagada` en el mismo movimiento (`_revisar_cobertura`), así que exigir
 *    "abierta" haría que el aviso no apareciera nunca. */
export const mpPaidIds = (bills: TableBill[]): string[] =>
  bills.flatMap((b) =>
    b.payments
      .filter((p) => p.status === "pagado" && p.method === "mercado_pago")
      .map((p) => p.id),
  );

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
  callIds: string[] = [],
  mpIds: string[] = [],
): AttentionSeen => {
  const orders = new Set(orderIds);
  const payments = new Set(paymentIds);
  const calls = new Set(callIds);
  const mp = new Set(mpIds);
  const keep = (set: ReadonlySet<string>, live: Set<string>) =>
    new Set([...set].filter((id) => live.has(id)));
  return {
    navOrders: keep(seen.navOrders, orders),
    navPayments: keep(seen.navPayments, payments),
    navCalls: keep(seen.navCalls, calls),
    navMp: keep(seen.navMp, mp),
    cardOrders: keep(seen.cardOrders, orders),
    cardPayments: keep(seen.cardPayments, payments),
    cardCalls: keep(seen.cardCalls, calls),
    cardMp: keep(seen.cardMp, mp),
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
  headerPedido: number;
  headerCuenta: number;
  headerPriority: boolean;
  tabPedidoPulse: boolean;
  tabCobrarPulse: boolean;
  unseenOrderIds: string[];
  unseenBillIds: string[];
  unseenCallIds: string[];
  unseenMpIds: string[];
  newOrderIds: string[];
  newBillIds: string[];
  newCallIds: string[];
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
  const mpIds = mpPaidIds(bills);
  const unseenOrderIds = unseenIn(orderIds, seen.navOrders);
  const unseenBillIds = unseenIn(billIds, seen.navPayments);
  /* Un llamado sigue pendiente hasta que alguien toca "Ya voy" (la base borra
   * `llamado_en`). Lo que se marca acá es haberlo *mirado*, que es lo que
   * apaga el latido fuerte: sin esto la pantalla late para siempre. */
  const unseenCallIds = unseenIn(calls, seen.navCalls);
  const newOrderIds = unseenIn(orderIds, seen.cardOrders);
  const newBillIds = unseenIn(billIds, seen.cardPayments);
  const newCallIds = unseenIn(calls, seen.cardCalls);
  /* El cobro de Mercado Pago no pide trabajo: ya está cobrado. Solo hay que
   * enterarse, así que tiene "visto" y no "pendiente", y no lo apaga ninguna
   * pestaña — no hay una cola donde vaya a aparecer. */
  const unseenMpIds = unseenIn(mpIds, seen.navMp);
  const onPedido = view === "pedido";
  const onCobrar = view === "cobrar";
  const headerOrders = onPedido ? 0 : unseenOrderIds.length + unseenCallIds.length;
  const headerBills = onCobrar ? 0 : unseenBillIds.length;

  const headerKeys = [
    ...(onPedido ? [] : unseenOrderIds.map((id) => `o:${id}`)),
    ...(onPedido ? [] : unseenCallIds.map((id) => `c:${id}`)),
    ...(onCobrar ? [] : unseenBillIds.map((id) => `p:${id}`)),
    ...unseenMpIds.map((id) => `mp:${id}`),
  ];

  return {
    pendingOrders: orderIds.length,
    pendingBills: billIds.length,
    waiterCalls: calls.length,
    waiterCallIds: calls,
    unseenOrders: unseenOrderIds.length,
    unseenBills: unseenBillIds.length,
    headerUnseen: headerOrders + headerBills + unseenMpIds.length,
    headerPedido: headerOrders,
    headerCuenta: headerBills,
    headerPriority: headerBills > 0,
    tabPedidoPulse:
      !onPedido && (unseenOrderIds.length > 0 || unseenCallIds.length > 0),
    tabCobrarPulse: !onCobrar && unseenBillIds.length > 0,
    unseenOrderIds,
    unseenBillIds,
    unseenCallIds,
    unseenMpIds,
    newOrderIds,
    newBillIds,
    newCallIds,
    headerKeys,
  };
};

export const idsForTable = (
  bill: TableBill | null,
): { orders: string[]; payments: string[]; calls: string[]; mp: string[] } => {
  if (!bill) return { orders: [], payments: [], calls: [], mp: [] };
  return {
    orders: openCreatedOrders(bill).map((o) => o.id),
    payments: guestBillRequests(bill).map((p) => p.id),
    calls: waiterCallSessionIds([bill]),
    mp: mpPaidIds([bill]),
  };
};
