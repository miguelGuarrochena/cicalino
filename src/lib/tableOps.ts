import type { OrderStatus } from "@/lib/types";
import {
  billPending,
  type BillGuest,
  type BillOrder,
  type TableBill,
} from "@/lib/tableBill";

export interface FloorQr {
  id: string;
  number: number;
  qrToken: string;
  qrActive: boolean;
}

/* Operational view of the dining room: kitchen work vs the bill.
 *
 * The database stays the authority (`mesa_sesiones`, `pedidos`, `pagos_mesa`).
 * This only derives what a waiter should look at first. Kitchen states beat
 * money states: a new pizza is more urgent than an unpaid Coke. */

export type FloorOpStatus =
  | "libre"
  | "sin-consumo"
  | "pedido-nuevo"
  | "llamado"
  | "preparando"
  | "listo"
  | "consumiendo"
  | "pendiente"
  | "parcial"
  | "esperando-pago"
  | "pagada"
  | "cerrada";

export type FloorFilter = "pedido" | "cobrar" | "todas";

export interface KitchenLine {
  name: string;
  quantity: number;
}

export interface GuestAccountRow {
  guest: BillGuest;
  consumption: number;
  paid: number;
  status: "pagado" | "parcial" | "pendiente" | "sin-consumo";
}

export interface FloorTable {
  key: string;
  tableId: string | null;
  tableNumber: number;
  qrToken: string | null;
  qrActive: boolean;
  bill: TableBill | null;
  status: FloorOpStatus;
  people: number;
  consumption: number;
  paid: number;
  pending: number;
  newOrders: BillOrder[];
  prepOrders: BillOrder[];
  readyOrders: BillOrder[];
  waitingPayments: number;
  waiterId: string | null;
  waiterName: string | null;
  calledAt: string | null;
}

export const kitchenOrders = (
  bill: TableBill,
  status: OrderStatus | OrderStatus[],
): BillOrder[] => {
  const want = Array.isArray(status) ? status : [status];
  return bill.orders.filter((o) => want.includes(o.status));
};

export const summarizeKitchen = (orders: BillOrder[]): KitchenLine[] => {
  const merged = new Map<string, KitchenLine>();
  for (const o of orders) {
    for (const item of o.items) {
      const key = item.name.trim().toLowerCase();
      const prev = merged.get(key);
      if (prev) prev.quantity += item.quantity;
      else merged.set(key, { name: item.name, quantity: item.quantity });
    }
  }
  return [...merged.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
};

export const guestAccountRows = (bill: TableBill): GuestAccountRow[] =>
  bill.guests.map((guest) => {
    const paid = bill.payments
      .filter((p) => p.guestId === guest.id && p.status === "pagado")
      .reduce((s, p) => s + p.base, 0);
    if (guest.consumption <= 0) {
      return { guest, consumption: 0, paid, status: "sin-consumo" };
    }
    if (paid >= guest.consumption) {
      return { guest, consumption: guest.consumption, paid, status: "pagado" };
    }
    if (paid > 0) {
      return { guest, consumption: guest.consumption, paid, status: "parcial" };
    }
    return { guest, consumption: guest.consumption, paid, status: "pendiente" };
  });

const waitingStaffPayments = (bill: TableBill): number =>
  bill.payments.filter((p) => p.status === "pendiente" && p.method !== "mercado_pago").length;

export const floorStatus = (bill: TableBill | null): FloorOpStatus => {
  if (!bill) return "libre";
  if (bill.session.status === "cerrada") return "cerrada";
  if (bill.session.status === "pagada") return "pagada";

  const created = kitchenOrders(bill, "creado").length;
  const ready = kitchenOrders(bill, "listo").length;
  const prep = kitchenOrders(bill, "en_preparacion").length;
  const waiting = waitingStaffPayments(bill);

  if (created > 0) return "pedido-nuevo";
  if (bill.session.calledAt) return "llamado";
  if (ready > 0) return "listo";
  if (waiting > 0) return "esperando-pago";
  if (prep > 0) return "preparando";
  if (bill.totals.consumption <= 0) return "sin-consumo";
  if (bill.totals.uncovered <= 0) return "pagada";
  if (bill.totals.paidBase > 0) return "parcial";
  const delivered = bill.orders.some((o) => o.status === "retirado");
  return delivered ? "consumiendo" : "pendiente";
};

export const needsPedido = (row: FloorTable): boolean =>
  row.newOrders.length > 0 || Boolean(row.calledAt);

export const needsCharge = (row: FloorTable): boolean =>
  Boolean(row.bill && row.bill.session.status === "abierta" && row.pending > 0);

export const isPaidToday = (bill: TableBill): boolean =>
  bill.totals.consumption > 0 &&
  (bill.session.status === "pagada" ||
    bill.session.status === "cerrada" ||
    (bill.session.status === "abierta" && billPending(bill) <= 0));

/* After a table is paid in full, open the first one still in this list.
 * The list order is what the waiter sees (urgency on Cobrar, number on Todas),
 * not the table number. They can still tap any other table. */
export const nextChargeAfter = (
  rows: FloorTable[],
  sessionId: string,
): FloorTable | null =>
  rows.find((r) => r.bill && r.pending > 0 && r.bill.session.id !== sessionId) ?? null;

const NOW_ORDER: Record<FloorOpStatus, number> = {
  "pedido-nuevo": 0,
  llamado: 1,
  listo: 2,
  "esperando-pago": 3,
  pendiente: 4,
  parcial: 5,
  preparando: 6,
  consumiendo: 7,
  pagada: 8,
  "sin-consumo": 9,
  libre: 10,
  cerrada: 11,
};

const toRow = (
  tableNumber: number,
  qr: FloorQr | null,
  bill: TableBill | null,
): FloorTable => ({
  key: bill?.session.id ?? qr?.id ?? `n-${tableNumber}`,
  tableId: qr?.id ?? bill?.session.tableId ?? null,
  tableNumber,
  qrToken: qr?.qrToken ?? null,
  qrActive: qr?.qrActive ?? false,
  bill,
  status: floorStatus(bill),
  people: bill?.guests.length ?? 0,
  consumption: bill?.totals.consumption ?? 0,
  paid: bill?.totals.paid ?? 0,
  pending: bill ? billPending(bill) : 0,
  newOrders: bill ? kitchenOrders(bill, "creado") : [],
  prepOrders: bill ? kitchenOrders(bill, "en_preparacion") : [],
  readyOrders: bill ? kitchenOrders(bill, "listo") : [],
  waitingPayments: bill ? waitingStaffPayments(bill) : 0,
  waiterId: null,
  waiterName: null,
  calledAt: bill?.session.calledAt ?? null,
});

export const buildFloor = (tables: FloorQr[], bills: TableBill[]): FloorTable[] => {
  const open = bills.filter((b) => b.session.status === "abierta");
  const byTableId = new Map<string, TableBill>();
  const byNumber = new Map<number, TableBill>();
  for (const b of open) {
    if (b.session.tableId) byTableId.set(b.session.tableId, b);
    byNumber.set(b.session.tableNumber, b);
  }

  const used = new Set<string>();
  const rows: FloorTable[] = tables.map((qr) => {
    const bill = (qr.id && byTableId.get(qr.id)) || byNumber.get(qr.number) || null;
    if (bill) used.add(bill.session.id);
    return toRow(qr.number, qr, bill);
  });

  for (const b of open) {
    if (used.has(b.session.id)) continue;
    rows.push(toRow(b.session.tableNumber, null, b));
  }

  return rows.sort(
    (a, b) =>
      NOW_ORDER[a.status] - NOW_ORDER[b.status] ||
      b.pending - a.pending ||
      a.tableNumber - b.tableNumber,
  );
};

export const filterFloor = (
  rows: FloorTable[],
  filtro: FloorFilter,
  query: string,
): FloorTable[] => {
  const q = query.trim().toLowerCase();
  const searched = q
    ? rows.filter(
        (r) =>
          String(r.tableNumber).includes(q) ||
          (r.waiterName ?? "").toLowerCase().includes(q),
      )
    : rows;
  if (filtro === "todas") {
    return [...searched].sort((a, b) => a.tableNumber - b.tableNumber);
  }
  if (filtro === "pedido") return searched.filter(needsPedido);
  if (filtro === "cobrar") return searched.filter(needsCharge);
  return searched;
};

export const kitchenInbox = (
  rows: FloorTable[],
): { created: FloorTable[]; called: FloorTable[]; prep: FloorTable[]; ready: FloorTable[] } => ({
  created: rows.filter((r) => r.newOrders.length > 0),
  called: rows.filter((r) => Boolean(r.calledAt) && r.newOrders.length === 0),
  prep: rows.filter((r) => r.prepOrders.length > 0 && r.newOrders.length === 0),
  ready: rows.filter((r) => r.readyOrders.length > 0),
});
