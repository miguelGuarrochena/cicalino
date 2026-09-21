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
  nextChargeAfter,
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
      calledAt: null,
      billState: "abierta" as const,
      intent: null,
      requestedAt: null,
      requestedBy: null,
      fullPayerId: null,
      fullPayerName: null,
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

  it("Pedido se apaga al anotar; Cobrar sigue hasta pagar todo", () => {
    const notedUnpaid = mkBill({
      orders: [order({ status: "en_preparacion" })],
    });
    const paid = mkBill({
      session: { ...mkBill().session, id: "s2", tableId: "m9", tableNumber: 9 },
      orders: [order({ status: "retirado" })],
      totals: {
        ...mkBill().totals,
        paid: 20000,
        paidBase: 20000,
        uncovered: 0,
        available: 0,
      },
    });
    const floor = buildFloor(
      [
        { id: "m8", number: 8, qrToken: "t8", qrActive: true },
        { id: "m9", number: 9, qrToken: "t9", qrActive: true },
      ],
      [notedUnpaid, paid],
    );
    expect(filterFloor(floor, "pedido", "").map((r) => r.tableNumber)).toEqual([]);
    expect(filterFloor(floor, "cobrar", "").map((r) => r.tableNumber)).toEqual([8]);
    expect(filterFloor(floor, "todas", "9").map((r) => r.tableNumber)).toEqual([9]);
    expect(
      filterFloor(
        floor.map((r) => (r.tableNumber === 8 ? { ...r, waiterName: "Pedro Gómez" } : r)),
        "todas",
        "pedro",
      ).map((r) => r.tableNumber),
    ).toEqual([8]);
  });

  it("un llamado prende Pedido aunque no haya pedido nuevo", () => {
    const bill = mkBill({
      orders: [order({ status: "retirado" })],
      session: { ...mkBill().session, calledAt: "2026-09-16T20:10:00Z" },
    });
    const floor = buildFloor([{ id: "m8", number: 8, qrToken: "t8", qrActive: true }], [bill]);
    expect(floor[0]?.status).toBe("llamado");
    expect(filterFloor(floor, "pedido", "").map((r) => r.tableNumber)).toEqual([8]);
    expect(kitchenInbox(floor).called.map((r) => r.tableNumber)).toEqual([8]);
  });

  it("al pagar una mesa, Cobrar abre la primera que sigue en la lista", () => {
    const two = mkBill({
      session: { ...mkBill().session, id: "s2", tableId: "m2", tableNumber: 2 },
    });
    const four = mkBill({
      session: { ...mkBill().session, id: "s4", tableId: "m4", tableNumber: 4 },
    });
    const five = mkBill({
      session: { ...mkBill().session, id: "s5", tableId: "m5", tableNumber: 5 },
      totals: { ...mkBill().totals, paid: 20000, paidBase: 20000, uncovered: 0, available: 0 },
    });
    const floor = buildFloor(
      [
        { id: "m2", number: 2, qrToken: "a", qrActive: true },
        { id: "m4", number: 4, qrToken: "b", qrActive: true },
        { id: "m5", number: 5, qrToken: "c", qrActive: true },
      ],
      [two, four, five],
    );
    const byN = new Map(floor.map((r) => [r.tableNumber, r]));
    const list = [byN.get(4)!, byN.get(2)!, byN.get(5)!];
    expect(nextChargeAfter(list, "s5")?.tableNumber).toBe(4);
    expect(nextChargeAfter(list, "s4")?.tableNumber).toBe(2);
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

  /* Mesas tiene tres colas y son las tres cosas que el mozo puede hacer:
   * anotar, ir a la mesa que llama y cobrar. El pedido ya anotado sale de la
   * cola — de ahí en adelante es de la comanda del local — pero la mesa sigue
   * activa y lo que pida después vuelve a entrar. */
  it("inbox separa lo que hay que anotar, quién llama y qué cobrar", () => {
    const floor = buildFloor(
      [
        { id: "m8", number: 8, qrToken: "a", qrActive: true },
        { id: "m12", number: 12, qrToken: "b", qrActive: true },
      ],
      [
        mkBill(),
        mkBill({
          session: { ...mkBill().session, id: "s2", tableId: "m12", tableNumber: 12 },
          orders: [order({ status: "en_preparacion" })],
        }),
      ],
    );
    const inbox = kitchenInbox(floor);
    expect(inbox.created.map((r) => r.tableNumber)).toEqual([8]);
    expect(Object.keys(inbox).sort()).toEqual(["bills", "called", "created"]);
    /* La 12 ya está anotada: no la lista ninguna cola. */
    expect(inbox.called).toEqual([]);
    expect(inbox.bills).toEqual([]);
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
