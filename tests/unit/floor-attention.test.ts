import { describe, it, expect } from "vitest";
import {
  emptyAttentionSeen,
  floorAttention,
  guestBillRequests,
  idsForTable,
  pendingBillIds,
  pendingOrderIds,
  pruneSeen,
  withIds,
} from "@/lib/floorAttention";
import type { BillOrder, BillPayment, TableBill } from "@/lib/tableBill";
import { kitchenInbox, buildFloor } from "@/lib/tableOps";

const order = (over: Partial<BillOrder> = {}): BillOrder => ({
  id: over.id ?? "o1",
  guestId: "juan",
  status: over.status ?? "creado",
  createdAt: "2026-09-16T20:00:00Z",
  readyAt: null,
  deliveredAt: null,
  cancelledAt: null,
  items: [
    {
      id: "i1",
      guestId: "juan",
      productId: "p1",
      name: "Pizza",
      unitPrice: 10000,
      quantity: 1,
      subtotal: 10000,
    },
  ],
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
  createdAt: "",
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
    ...over.session,
  },
  guests: over.guests ?? [{ id: "juan", name: "Juan", joinedAt: "", consumption: 10000 }],
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

describe("floor attention — pedido vs cuenta vs visto", () => {
  it("un pedido creado es pendiente; pedir la cuenta no se mezcla", () => {
    const open = bill({
      orders: [order(), order({ id: "o2", createdAt: "2026-09-16T20:20:00Z" })],
      payments: [pay()],
    });
    expect(pendingOrderIds([open])).toEqual(["o1", "o2"]);
    expect(pendingBillIds([open])).toEqual(["pay1"]);
    expect(guestBillRequests(open)).toHaveLength(1);
  });

  it("un pago del personal o de Mercado Pago no es solicitud de cuenta", () => {
    const open = bill({
      orders: [order({ status: "retirado" })],
      payments: [
        pay({ id: "staff", createdBy: "personal" }),
        pay({ id: "mp", method: "mercado_pago", createdBy: "comensal" }),
      ],
    });
    expect(pendingBillIds([open])).toEqual([]);
    expect(guestBillRequests(open)).toEqual([]);
  });

  it("entrar a Pedido apaga el header de pedidos y deja Cuentas", () => {
    const open = bill({ payments: [pay()] });
    const unseen = floorAttention([open], emptyAttentionSeen(), null);
    expect(unseen.headerUnseen).toBe(2);
    expect(unseen.headerPedido).toBe(1);
    expect(unseen.headerCuenta).toBe(1);
    expect(unseen.tabPedidoPulse).toBe(true);
    expect(unseen.tabCobrarPulse).toBe(true);

    const afterPedido = floorAttention(
      [open],
      { ...emptyAttentionSeen(), navOrders: new Set(["o1"]) },
      "pedido",
    );
    expect(afterPedido.headerUnseen).toBe(1);
    expect(afterPedido.headerPedido).toBe(0);
    expect(afterPedido.headerCuenta).toBe(1);
    expect(afterPedido.headerPriority).toBe(true);
    expect(afterPedido.tabPedidoPulse).toBe(false);
    expect(afterPedido.tabCobrarPulse).toBe(true);
    expect(afterPedido.newOrderIds).toEqual(["o1"]);
  });

  it("abrir la mesa pasa de Nuevo a Visto sin resolver el trabajo", () => {
    const open = bill({ payments: [pay()] });
    const seen = {
      ...emptyAttentionSeen(),
      navOrders: new Set(["o1"]),
      cardOrders: new Set(["o1"]),
      navPayments: new Set(["pay1"]),
      cardPayments: new Set(["pay1"]),
    };
    const after = floorAttention([open], seen, "cobrar");
    expect(after.newOrderIds).toEqual([]);
    expect(after.newBillIds).toEqual([]);
    expect(after.pendingOrders).toBe(1);
    expect(after.pendingBills).toBe(1);
    expect(after.headerUnseen).toBe(0);
  });

  it("prunes ids que ya no están pendientes", () => {
    const seen = {
      ...emptyAttentionSeen(),
      navOrders: new Set(["old", "o1"]),
      cardPayments: new Set(["gone"]),
    };
    const next = pruneSeen(seen, ["o1"], []);
    expect([...next.navOrders]).toEqual(["o1"]);
    expect([...next.cardPayments]).toEqual([]);
  });

  it("idsForTable solo toma lo abierto de esa mesa", () => {
    expect(idsForTable(bill({ payments: [pay()] }))).toEqual({
      orders: ["o1"],
      payments: ["pay1"],
    });
  });

  it("withIds no pisa lo ya visto", () => {
    expect([...withIds(new Set(["a"]), ["a", "b"])].sort()).toEqual(["a", "b"]);
  });

  it("un pedido nuevo posterior vuelve a ser novedad aunque la mesa ya se vio", () => {
    const second = bill({
      orders: [
        order({ id: "beer", status: "en_preparacion" }),
        order({ id: "pizza", createdAt: "2026-09-16T20:20:00Z" }),
      ],
    });
    const seen = {
      ...emptyAttentionSeen(),
      navOrders: new Set(["beer"]),
      cardOrders: new Set(["beer"]),
    };
    const next = floorAttention([second], seen, null);
    expect(next.newOrderIds).toEqual(["pizza"]);
    expect(next.headerUnseen).toBe(1);
    expect(next.pendingOrders).toBe(1);
  });

  it("pedido nuevo y cuenta solicitada conviven en colas distintas", () => {
    const open = bill({ payments: [pay()] });
    const floor = buildFloor(
      [{ id: "m8", number: 8, qrToken: "t", qrActive: true }],
      [open],
    );
    const inbox = kitchenInbox(floor);
    expect(inbox.created.map((r) => r.tableNumber)).toEqual([8]);
    expect(inbox.bills.map((r) => r.tableNumber)).toEqual([8]);
    const both = floorAttention([open], emptyAttentionSeen(), null);
    expect(both.unseenOrders).toBe(1);
    expect(both.unseenBills).toBe(1);
    expect(both.headerUnseen).toBe(2);
    expect(both.headerPedido).toBe(1);
    expect(both.headerCuenta).toBe(1);
  });

  it("la cola de Cobrar lista la mesa que pidió la cuenta", () => {
    const floor = buildFloor(
      [{ id: "m8", number: 8, qrToken: "t", qrActive: true }],
      [bill({ orders: [order({ status: "retirado" })], payments: [pay()] })],
    );
    expect(kitchenInbox(floor).bills.map((r) => r.tableNumber)).toEqual([8]);
    expect(kitchenInbox(floor).created).toEqual([]);
  });
});
