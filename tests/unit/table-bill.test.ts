import { describe, it, expect } from "vitest";
import {
  DEFAULT_PAYMENT_SETTINGS,
  consumptionByGuest,
  enabledMethods,
  mapBill,
  paymentsByPayer,
  billPending,
  billStatus,
  previewPayment,
  parsePartCount,
  splitModeLocked,
  type BillPayment,
  type PaymentSettings,
  type TableBill,
} from "@/lib/tableBill";
import { DICT, translate } from "@/lib/i18n";

/* The same cases the SQL checks run (tests/integration/split-payments.test.ts).
 * previewPayment must land on the exact amounts _crear_pago_mesa computes,
 * or the guest would always get "monto-cambio". */

const item = (id: string, guestId: string, name: string, unitPrice: number, quantity = 1) => ({
  id,
  guestId,
  productId: `p-${name}`,
  name,
  unitPrice,
  quantity,
  subtotal: unitPrice * quantity,
});

const payment = (over: Partial<BillPayment>): BillPayment => ({
  id: "pay",
  guestId: null,
  payerName: "X",
  mode: "consumo",
  parts: 1,
  base: 0,
  tip: 0,
  tipPercent: null,
  surcharge: 0,
  surchargePercent: 0,
  total: 0,
  method: "efectivo",
  status: "pendiente",
  createdBy: "comensal",
  confirmation: null,
  createdAt: "2026-09-16T20:00:00Z",
  confirmedAt: null,
  cancelledAt: null,
  cancelReason: null,
  expiresAt: null,
  mpStatus: null,
  ...over,
});

const mkBill = (over: Partial<TableBill> = {}, payments: BillPayment[] = []): TableBill => {
  const orders = [
    {
      id: "o1",
      guestId: "juan",
      status: "creado" as const,
      createdAt: "2026-09-16T20:00:00Z",
      readyAt: null,
      deliveredAt: null,
      cancelledAt: null,
      items: [item("i1", "juan", "Hamburguesa", 10000), item("i2", "juan", "Coca-Cola", 2000)],
    },
    {
      id: "o2",
      guestId: "maria",
      status: "creado" as const,
      createdAt: "2026-09-16T20:01:00Z",
      readyAt: null,
      deliveredAt: null,
      cancelledAt: null,
      items: [item("i3", "maria", "Pizza", 15000), item("i4", "maria", "Agua", 2000)],
    },
  ];
  const active = payments.filter((p) => p.status !== "cancelado");
  return {
    session: {
      id: "s1",
      branchId: "l1",
      tableId: "m1",
      tableNumber: 5,
      status: "abierta",
      splitMode: active.length ? active[0]!.mode : null,
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
    },
    guests: [
      { id: "juan", name: "Juan", joinedAt: "", consumption: 12000 },
      { id: "maria", name: "María", joinedAt: "", consumption: 17000 },
    ],
    orders,
    payments,
    totals: {
      consumption: 29000,
      tips: 0,
      surcharges: 0,
      total: 29000,
      paid: 0,
      pendingConfirmation: 0,
      paidBase: 0,
      committedBase: active.reduce((s, p) => s + p.base, 0),
      committedParts: active.reduce((s, p) => s + p.parts, 0),
      uncovered: 29000,
      available: 29000 - active.reduce((s, p) => s + p.base, 0),
    },
    ...over,
  };
};

const settings: PaymentSettings = { ...DEFAULT_PAYMENT_SETTINGS, creditSurchargePct: 3, surchargeDeclared: true };

describe("previewPayment", () => {
  it("mi consumo + propina 10% (Juan) y 5% (María)", () => {
    const bill = mkBill();
    expect(previewPayment(bill, "juan", { mode: "consumo", method: "efectivo", tipPercent: 10 }, settings))
      .toMatchObject({ ok: true, base: 12000, tip: 1200, total: 13200 });
    expect(previewPayment(bill, "maria", { mode: "consumo", method: "efectivo", tipPercent: 5 }, settings))
      .toMatchObject({ ok: true, base: 17000, tip: 850, total: 17850 });
  });

  it("recargo de tarjeta solo sobre el consumo, no sobre la propina", () => {
    const r = previewPayment(mkBill(), "maria", { mode: "consumo", method: "tarjeta_credito", tipPercent: 5 }, settings);
    expect(r).toMatchObject({ ok: true, base: 17000, tip: 850, surcharge: 510, total: 18360 });
    expect(
      previewPayment(mkBill(), "maria", { mode: "consumo", method: "tarjeta_debito" }, settings),
    ).toMatchObject({ surcharge: 0 });
  });

  it("no deja pagar dos veces el mismo consumo ni cambiar de modo con pagos activos", () => {
    const bill = mkBill({}, [payment({ guestId: "juan", base: 12000, mode: "consumo" })]);
    expect(previewPayment(bill, "juan", { mode: "consumo", method: "efectivo" }, settings))
      .toEqual({ ok: false, reason: "nada-que-pagar" });
    expect(previewPayment(bill, "maria", { mode: "iguales", method: "efectivo" }, settings))
      .toEqual({ ok: false, reason: "modo-bloqueado" });
  });

  it("partes iguales: la última parte cierra exacto aunque no divida justo", () => {
    const three = mkBill({
      guests: [
        { id: "a", name: "Ana", joinedAt: "", consumption: 17000 },
        { id: "b", name: "Beto", joinedAt: "", consumption: 2000 },
        { id: "c", name: "Caro", joinedAt: "", consumption: 0 },
      ],
      totals: { ...mkBill().totals, consumption: 19000, available: 19000 },
    });
    const first = previewPayment(three, "a", { mode: "iguales", method: "efectivo" }, settings);
    expect(first).toMatchObject({ ok: true, base: 6333, totalParts: 3 });

    const afterTwo = {
      ...three,
      session: { ...three.session, splitMode: "iguales" as const, parts: 3 },
      payments: [
        payment({ mode: "iguales", base: 6333, parts: 1 }),
        payment({ mode: "iguales", base: 6333, parts: 1 }),
      ],
    };
    expect(previewPayment(afterTwo, "c", { mode: "iguales", method: "efectivo" }, settings))
      .toMatchObject({ ok: true, base: 19000 - 6333 * 2 });
  });

  it("monto o porcentaje respeta lo que falta", () => {
    const bill = mkBill({ totals: { ...mkBill().totals, consumption: 30000, available: 30000 } });
    expect(previewPayment(bill, "juan", { mode: "monto", method: "efectivo", percent: 40 }, settings))
      .toMatchObject({ ok: true, base: 12000 });
    const partly = mkBill(
      { totals: { ...mkBill().totals, consumption: 30000 } },
      [payment({ mode: "monto", base: 12000 })],
    );
    expect(previewPayment(partly, "juan", { mode: "monto", method: "efectivo", amount: 18001 }, settings))
      .toEqual({ ok: false, reason: "excede", available: 18000 });
  });

  it("50% y 45% dejan el resto, y un monto parcial también", () => {
    const bill = mkBill({ totals: { ...mkBill().totals, consumption: 40000 } });
    expect(
      previewPayment(bill, "juan", { mode: "monto", method: "efectivo", percent: 50 }, settings),
    ).toMatchObject({ ok: true, base: 20000, remaining: 20000 });
    const afterHalf = mkBill(
      { totals: { ...mkBill().totals, consumption: 40000 } },
      [payment({ mode: "monto", base: 20000 })],
    );
    expect(
      previewPayment(afterHalf, "maria", { mode: "monto", method: "efectivo", percent: 45 }, settings),
    ).toMatchObject({ ok: true, base: 18000, remaining: 2000 });
    expect(
      previewPayment(bill, "juan", { mode: "monto", method: "efectivo", amount: 24000 }, settings),
    ).toMatchObject({ ok: true, base: 24000, remaining: 16000 });
  });

  it("parsePartCount permite borrar el 1 para escribir otro número", () => {
    expect(parsePartCount("")).toBeNull();
    expect(parsePartCount("0")).toBeNull();
    expect(parsePartCount("1")).toBe(1);
    expect(parsePartCount("12")).toBe(12);
    expect(parsePartCount("51")).toBeNull();
  });

  it("un pago de Mercado Pago vencido libera su parte, como en SQL", () => {
    const bill = mkBill({}, [
      payment({
        mode: "uno",
        base: 29000,
        method: "mercado_pago",
        expiresAt: "2026-09-16T20:05:00Z",
      }),
    ]);
    const now = new Date("2026-09-16T21:00:00Z");
    expect(previewPayment(bill, "maria", { mode: "uno", method: "efectivo" }, settings, now))
      .toMatchObject({ ok: true, base: 29000 });
  });

  it("propina de otro monto no puede superar el consumo que se paga", () => {
    expect(previewPayment(mkBill(), "juan", { mode: "consumo", method: "efectivo", tipAmount: 12001 }, settings))
      .toEqual({ ok: false, reason: "propina-invalida" });
  });
});

describe("vistas de la cuenta", () => {
  it("consumo agrupado por comensal, sin pedidos cancelados", () => {
    const bill = mkBill();
    bill.orders.push({
      id: "o3",
      guestId: "juan",
      status: "cancelado",
      createdAt: "",
      readyAt: null,
      deliveredAt: null,
      cancelledAt: "",
      items: [item("i5", "juan", "Hamburguesa", 10000)],
    });
    bill.orders.push({
      id: "o4",
      guestId: "juan",
      status: "listo",
      createdAt: "",
      readyAt: null,
      deliveredAt: null,
      cancelledAt: null,
      items: [item("i6", "juan", "Coca-Cola", 2000)],
    });
    const juan = consumptionByGuest(bill).find((g) => g.guest.id === "juan")!;
    expect(juan.subtotal).toBe(14000);
    expect(juan.lines.find((l) => l.name === "Coca-Cola")).toMatchObject({ quantity: 2, subtotal: 4000 });
  });

  it("pagos por persona: incluye a quien no pagó y a quien pagó sin escanear", () => {
    const bill = mkBill({}, [
      payment({ id: "1", guestId: "juan", payerName: "Juan", base: 12000, tip: 1200, total: 13200, status: "pagado", method: "mercado_pago" }),
      payment({ id: "2", guestId: null, payerName: "Pedro", base: 10000, total: 10000 }),
    ]);
    const rows = paymentsByPayer(bill);
    expect(rows.map((r) => r.name)).toEqual(["Juan", "María", "Pedro"]);
    expect(rows[0]).toMatchObject({ paid: 13200, pending: 0 });
    expect(rows[1]!.payments).toHaveLength(0);
    expect(rows[2]).toMatchObject({ paid: 0, pending: 10000 });
  });

  it("mapBill traduce el JSON de _cuenta_json", () => {
    const b = mapBill({
      sesion: { id: "s", local_id: "l", mesa_id: "m", mesa_numero: 12, estado: "abierta", version: 3 },
      comensales: [{ id: "g", nombre: "Ana", creado_en: "x", consumo: 5000 }],
      pedidos: [],
      pagos: [{ id: "p", monto_base: 5000, propina: 500, recargo: 0, monto_total: 5500, metodo: "efectivo", estado: "pendiente", modo: "uno", partes: 1 }],
      totales: { consumo: 5000, total: 5500, disponible: 0, falta_cubrir: 5000 },
    });
    expect(b?.session.tableNumber).toBe(12);
    expect(b?.guests[0]).toMatchObject({ name: "Ana", consumption: 5000 });
    expect(b?.payments[0]).toMatchObject({ base: 5000, tip: 500, total: 5500 });
    expect(b?.totals).toMatchObject({ consumption: 5000, available: 0, uncovered: 5000 });
  });

  it("mapBill lee el llamado al mozo aunque venga como Date", () => {
    const iso = "2026-09-16T20:10:00.000Z";
    const fromString = mapBill({
      sesion: { id: "s", local_id: "l", mesa_numero: 1, estado: "abierta", llamado_en: iso },
      comensales: [],
      pedidos: [],
      pagos: [],
      totales: {},
    });
    const fromDate = mapBill({
      sesion: { id: "s", local_id: "l", mesa_numero: 1, estado: "abierta", llamado_en: new Date(iso) },
      comensales: [],
      pedidos: [],
      pagos: [],
      totales: {},
    });
    expect(fromString?.session.calledAt).toBe(iso);
    expect(fromDate?.session.calledAt).toBe(iso);
  });

  it("el aviso de efectivo dice el método, no que ya pagaron del celular", () => {
    expect(translate("es", "mesas.pagoElegido", { m: translate("es", "mesa.metodo.efectivo") }))
      .toBe("Pago elegido: Efectivo");
    expect(translate("en", "mesas.pagoElegido", { m: translate("en", "mesa.metodo.efectivo") }))
      .toBe("Payment chosen: Cash");
  });
});

describe("métodos de pago", () => {
  it("Mercado Pago solo con cuenta conectada y nunca para el personal", () => {
    const s = { ...DEFAULT_PAYMENT_SETTINGS, mercadoPago: true, transfer: true };
    expect(enabledMethods(s, { mercadoPagoConnected: false })).not.toContain("mercado_pago");
    expect(enabledMethods(s, { mercadoPagoConnected: true })).toContain("mercado_pago");
    expect(enabledMethods(s, { mercadoPagoConnected: true, forStaff: true })).not.toContain("mercado_pago");
  });

  it("QR de Mercado Pago se habilita aparte y el personal también lo ve", () => {
    const off = { ...DEFAULT_PAYMENT_SETTINGS, mpQr: false };
    const on = { ...DEFAULT_PAYMENT_SETTINGS, mpQr: true };
    expect(enabledMethods(off, { mercadoPagoConnected: true })).not.toContain("qr_mercado_pago");
    expect(enabledMethods(on, { mercadoPagoConnected: false })).toContain("qr_mercado_pago");
    expect(enabledMethods(on, { mercadoPagoConnected: true, forStaff: true })).toContain("qr_mercado_pago");
  });

  it("cada método, modo y estado tiene texto en los dos idiomas", () => {
    const keys = [
      ...["mercado_pago", "transferencia", "efectivo", "qr_mercado_pago", "tarjeta_debito", "tarjeta_credito"].map((m) => `mesa.metodo.${m}`),
      ...["consumo", "iguales", "uno", "monto", "porcentaje"].flatMap((m) => [`mesa.modo.${m}`, `mesa.modoAyuda.${m}`]),
      ...["pendiente", "pagado", "cancelado"].map((s) => `mesa.estadoPago.${s}`),
      ...["creado", "en_preparacion", "listo", "retirado", "cancelado"].map((s) => `mesa.estadoPedido.${s}`),
      ...["pendiente", "parcial", "pagada", "sin-consumo", "cerrada"].map((s) => `mesas.estadoCobro.${s}`),
      ...["conectado", "no-configurado", "no-autorizado", "error"].map((s) => `cobros.mp.${s}`),
    ];
    expect(DICT.es).toBeTruthy();
    for (const locale of ["es", "en"] as const) {
      for (const k of keys) expect(translate(locale, k), `${locale}:${k}`).not.toBe(k);
    }
  });
});

describe("cobro en el local", () => {
  it("el personal cobra un monto aunque la mesa haya elegido otra forma de dividir", () => {
    const bill = mkBill({}, [payment({ guestId: "juan", base: 12000, mode: "consumo" })]);
    expect(previewPayment(bill, null, { mode: "monto", method: "efectivo", amount: 17000 }, settings, new Date(), "personal"))
      .toMatchObject({ ok: true, base: 17000 });
    /* A guest still can't switch modes. */
    expect(previewPayment(bill, "maria", { mode: "monto", method: "efectivo", amount: 17000 }, settings))
      .toEqual({ ok: false, reason: "modo-bloqueado" });
    /* And nobody overpays. */
    expect(previewPayment(bill, null, { mode: "monto", method: "efectivo", amount: 17001 }, settings, new Date(), "personal"))
      .toEqual({ ok: false, reason: "excede", available: 17000 });
  });

  it("un cobro presencial no fija el modo de la mesa ni cuenta como parte", () => {
    const bill = mkBill({}, [payment({ mode: "monto", base: 5000, createdBy: "personal" })]);
    bill.session.splitMode = null;
    expect(splitModeLocked(bill)).toBe(false);
    const r = previewPayment(bill, "juan", { mode: "iguales", method: "efectivo", totalParts: 2 }, settings);
    expect(r).toMatchObject({ ok: true, base: Math.floor(24000 / 2), totalParts: 2 });
  });
});

describe("semáforo de cobros", () => {
  const withTotals = (over: Partial<TableBill["totals"]>, status: TableBill["session"]["status"] = "abierta") => {
    const b = mkBill();
    b.session.status = status;
    b.totals = { ...b.totals, ...over };
    return b;
  };

  it("pendiente, parcial y pagada según lo confirmado", () => {
    expect(billStatus(withTotals({ paidBase: 0, uncovered: 29000 }))).toBe("pendiente");
    expect(billStatus(withTotals({ paidBase: 12000, uncovered: 17000 }))).toBe("parcial");
    expect(billStatus(withTotals({ paidBase: 29000, uncovered: 0 }))).toBe("pagada");
    expect(billStatus(withTotals({}, "pagada"))).toBe("pagada");
    expect(billStatus(withTotals({ consumption: 0 }))).toBe("sin-consumo");
  });

  it("lo pendiente incluye propinas ya sumadas a los pagos", () => {
    expect(billPending(withTotals({ total: 31050, paid: 13200 }))).toBe(17850);
    expect(billPending(withTotals({ total: 100, paid: 200 }))).toBe(0);
  });
});

