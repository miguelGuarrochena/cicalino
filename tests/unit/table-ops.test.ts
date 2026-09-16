import { describe, it, expect } from "vitest";
import {
  billPending,
  type BillOrder,
  type BillPayment,
  type TableBill,
} from "@/lib/tableBill";
import {
  buildFloor,
  filterFloor,
  floorStatus,
  guestAccountRows,
  kitchenInbox,
  summarizeKitchen,
} from "@/lib/tableOps";

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
      quantity: 2,
      subtotal: 20000,
    },
  ],
  ...over,
});

const mkBill = (over: Partial<TableBill> = {}): TableBill => {
  const payments = over.payments ?? [];
  const consumption = over.totals?.consumption ?? 20000;
  const paid = over.totals?.paid ?? 0;
  const paidBase = over.totals?.paidBase ?? 0;
  const uncovered = over.totals?.uncovered ?? Math.max(consumption - paidBase, 0);
  return {
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
      ...over.session,
    },
    guests: over.guests ?? [{ id: "juan", name: "Juan", joinedAt: "", consumption }],
    orders: over.orders ?? [order({ status: "creado" })],
    payments,
    totals: {
      consumption,
      tips: 0,
      surcharges: 0,
      total: consumption,
      paid,
      pendingConfirmation: 0,
      paidBase,
      committedBase: 0,
      committedParts: 0,
      uncovered,
      available: uncovered,
      ...over.totals,
    },
  };
};

describe("floorStatus — cocina primero, después caja", () => {
  it("sin sesión es libre", () => {
    expect(floorStatus(null)).toBe("libre");
  });

  it("un pedido creado gana sobre el saldo pendiente", () => {
    expect(floorStatus(mkBill({ totals: { ...mkBill().totals, uncovered: 20000, paidBase: 0 } }))).toBe(
      "pedido-nuevo",
    );
  });

  it("listo gana sobre preparando", () => {
    expect(
      floorStatus(
        mkBill({
          orders: [order({ id: "a", status: "en_preparacion" }), order({ id: "b", status: "listo" })],
        }),
      ),
    ).toBe("listo");
  });

  it("comida entregada y sin pagar es consumiendo", () => {
    expect(
      floorStatus(
        mkBill({
          orders: [order({ status: "retirado" })],
          totals: { ...mkBill().totals, uncovered: 20000, paidBase: 0 },
        }),
      ),
    ).toBe("consumiendo");
  });

  it("pago parcial se ve cuando cocina ya entregó", () => {
    expect(
      floorStatus(
        mkBill({
          orders: [order({ status: "retirado" })],
          totals: { ...mkBill().totals, uncovered: 8000, paidBase: 12000, paid: 12000 },
        }),
      ),
    ).toBe("parcial");
  });

  it("pago esperando confirmación del personal", () => {
    const pending: BillPayment = {
      id: "pay",
      guestId: "juan",
      payerName: "Juan",
      mode: "consumo",
      parts: 1,
      base: 20000,
      tip: 0,
      tipPercent: null,
      surcharge: 0,
      surchargePercent: 0,
      total: 20000,
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
    };
    expect(
      floorStatus(
        mkBill({
          orders: [order({ status: "retirado" })],
          payments: [pending],
        }),
      ),
    ).toBe("esperando-pago");
  });
});

describe("buildFloor", () => {
  it("junta mesas físicas con cuentas abiertas y deja las libres", () => {
    const floor = buildFloor(
      [
        { id: "m8", number: 8, qrToken: "tok8", qrActive: true },
        { id: "m9", number: 9, qrToken: "tok9", qrActive: true },
      ],
      [mkBill()],
    );
    expect(floor.map((r) => r.tableNumber)).toEqual([8, 9]);
    expect(floor[0]?.status).toBe("pedido-nuevo");
    expect(floor[1]?.status).toBe("libre");
    expect(billPending(floor[0]!.bill!)).toBe(20000);
  });

  it("Ahora no mezcla mesas libres ni históricas", () => {
    const floor = buildFloor(
      [
        { id: "m8", number: 8, qrToken: "t8", qrActive: true },
        { id: "m9", number: 9, qrToken: "t9", qrActive: true },
      ],
      [mkBill(), mkBill({ session: { ...mkBill().session, id: "s2", tableId: "m9", tableNumber: 9, status: "cerrada" } })],
    );
    expect(filterFloor(floor, "ahora", "").map((r) => r.tableNumber)).toEqual([8]);
    expect(filterFloor(floor, "todas", "9").map((r) => r.tableNumber)).toEqual([9]);
    expect(filterFloor(floor, "todas", "").map((r) => r.tableNumber)).toEqual([8, 9]);
  });
});

describe("comanda", () => {
  it("resume cantidades para leer de un vistazo", () => {
    const lines = summarizeKitchen([
      order({
        items: [
          { id: "a", guestId: "juan", productId: "p", name: "Pizza", unitPrice: 1, quantity: 2, subtotal: 2 },
          { id: "b", guestId: "juan", productId: "c", name: "Coca-Cola", unitPrice: 1, quantity: 1, subtotal: 1 },
        ],
      }),
      order({
        id: "o2",
        items: [{ id: "c", guestId: "maria", productId: "p", name: "Pizza", unitPrice: 1, quantity: 1, subtotal: 1 }],
      }),
    ]);
    expect(lines).toEqual([
      { name: "Pizza", quantity: 3 },
      { name: "Coca-Cola", quantity: 1 },
    ]);
  });

  it("inbox separa nuevos, en comanda y listos", () => {
    const floor = buildFloor(
      [
        { id: "m8", number: 8, qrToken: "a", qrActive: true },
        { id: "m12", number: 12, qrToken: "b", qrActive: true },
      ],
      [
        mkBill(),
        mkBill({
          session: { ...mkBill().session, id: "s2", tableId: "m12", tableNumber: 12 },
          orders: [order({ status: "listo" })],
        }),
      ],
    );
    const inbox = kitchenInbox(floor);
    expect(inbox.created.map((r) => r.tableNumber)).toEqual([8]);
    expect(inbox.ready.map((r) => r.tableNumber)).toEqual([12]);
  });
});

describe("cuenta por persona", () => {
  it("marca pagado / pendiente sin mezclar la comanda", () => {
    const bill = mkBill({
      guests: [
        { id: "juan", name: "Juan", joinedAt: "", consumption: 15000 },
        { id: "maria", name: "María", joinedAt: "", consumption: 10000 },
      ],
      payments: [
        {
          id: "pay",
          guestId: "juan",
          payerName: "Juan",
          mode: "consumo",
          parts: 1,
          base: 15000,
          tip: 0,
          tipPercent: null,
          surcharge: 0,
          surchargePercent: 0,
          total: 15000,
          method: "efectivo",
          status: "pagado",
          createdBy: "comensal",
          confirmation: "manual",
          createdAt: "",
          confirmedAt: "",
          cancelledAt: null,
          cancelReason: null,
          expiresAt: null,
          mpStatus: null,
        },
      ],
    });
    const rows = guestAccountRows(bill);
    expect(rows[0]).toMatchObject({ status: "pagado", consumption: 15000 });
    expect(rows[1]).toMatchObject({ status: "pendiente", consumption: 10000 });
  });
});
