import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_PAYMENT_SETTINGS,
  billRequested,
  mapBill,
  myDefinedPayment,
  payAllBase,
  previewGuestShare,
  previewPayAll,
  type BillPayment,
  type TableBill,
} from "@/lib/tableBill";
import { guestBillRequests } from "@/lib/floorAttention";

const root = process.cwd();
const sql = readFileSync(join(root, "supabase/mesa-cuenta-compartida.sql"), "utf8");
const enumSql = readFileSync(join(root, "supabase/mesa-cuenta-enum.sql"), "utf8");
const orden: string[] = JSON.parse(
  readFileSync(join(root, "supabase/orden.json"), "utf8"),
);
const chequeo = readFileSync(
  join(root, "supabase/chequeo-migraciones.sql"),
  "utf8",
);

const payment = (over: Partial<BillPayment> = {}): BillPayment => ({
  id: "pay",
  guestId: "juan",
  payerName: "Juan",
  mode: "consumo",
  parts: 1,
  base: 12500,
  tip: 0,
  tipPercent: null,
  surcharge: 0,
  surchargePercent: 0,
  total: 12500,
  method: "efectivo",
  status: "definido",
  createdBy: "comensal",
  confirmation: null,
  createdAt: "2026-09-21T12:00:00Z",
  confirmedAt: null,
  cancelledAt: null,
  cancelReason: null,
  expiresAt: null,
  mpStatus: null,
  ...over,
});

const mkBill = (payments: BillPayment[] = []): TableBill => {
  const active = payments.filter((p) => p.status !== "cancelado");
  const committed = active.reduce((s, p) => s + p.base, 0);
  return {
    session: {
      id: "s1",
      branchId: "l1",
      tableId: "m1",
      tableNumber: 8,
      status: "abierta",
      splitMode: null,
      parts: null,
      version: 1,
      openedAt: "2026-09-21T12:00:00Z",
      updatedAt: "2026-09-21T12:00:00Z",
      paidAt: null,
      closedAt: null,
      closeReason: null,
      calledAt: null,
      billState: committed > 0 ? "dividiendo" : "abierta",
      intent: committed > 0 ? "dividir" : null,
      requestedAt: null,
      requestedBy: null,
      fullPayerId: null,
      fullPayerName: null,
    },
    guests: [
      { id: "juan", name: "Juan", joinedAt: "", consumption: 12500 },
      { id: "maria", name: "María", joinedAt: "", consumption: 22500 },
    ],
    orders: [],
    payments,
    totals: {
      consumption: 35000,
      tips: 0,
      surcharges: 0,
      total: 35000,
      paid: 0,
      pendingConfirmation: 0,
      paidBase: 0,
      committedBase: committed,
      committedParts: 0,
      uncovered: 35000,
      available: 35000 - committed,
    },
  };
};

describe("Cuenta compartida — SQL", () => {
  it("el enum va antes de usarlo", () => {
    expect(orden.indexOf("mesa-cuenta-enum.sql")).toBeLessThan(
      orden.indexOf("mesa-cuenta-compartida.sql"),
    );
    expect(orden.indexOf("mesa-pedir-cuenta.sql")).toBeLessThan(
      orden.indexOf("mesa-cuenta-compartida.sql"),
    );
  });

  it("chequeo-migraciones lo registra", () => {
    expect(chequeo).toContain(
      "('mesa-cuenta-enum.sql', 'enum_value', 'pago_mesa_estado.definido', 85)",
    );
    expect(chequeo).toContain(
      "('mesa-cuenta-compartida.sql', 'function', 'pagar_todo_comensal', 86)",
    );
    expect(chequeo).toContain("('mesa-cuenta-compartida.sql', 'mesa-cuenta-enum.sql");
  });

  it("definir no cobra ni pide: estado definido, sin checkout", () => {
    expect(enumSql).toMatch(/add value if not exists 'definido'/);
    expect(sql).toContain("'definido'");
    expect(sql).toContain("definir_parte_comensal");
    expect(sql).toContain("pedir_cuenta_comensal");
    expect(sql).toContain("pagar_todo_comensal");
    expect(sql).not.toContain("checkout/preferences");
  });

  it("pagar todo cancela la división y pide la cuenta", () => {
    expect(sql).toContain("cancelado_motivo = 'pago-total'");
    expect(sql).toContain("cuenta_intencion = 'total'");
    expect(sql).toContain("cuenta_solicitada_en = now()");
    expect(sql).toContain("cuenta_pagador_total_nombre");
  });

  it("no se pide hasta cubrir el total, y FOR UPDATE serializa", () => {
    expect(sql).toContain("reason', 'falta-definir'");
    expect(sql).toContain("for update");
    expect(sql).toContain("if v_s.cuenta_solicitada_en is not null");
  });

  it("Mercado Pago no expira la reserva una vez pedida la cuenta", () => {
    expect(sql).toContain("if v_solicitada is not null then");
    expect(sql).toContain("return 0;");
  });
});

describe("Cuenta compartida — montos", () => {
  const settings = DEFAULT_PAYMENT_SETTINGS;

  it("la parte por defecto es el consumo real, y se puede cambiar a monto", () => {
    const bill = mkBill();
    const consumo = previewGuestShare(
      bill,
      "juan",
      { mode: "consumo", method: "efectivo" },
      settings,
    );
    expect(consumo).toMatchObject({ ok: true, base: 12500 });
    const iguales = previewGuestShare(
      bill,
      "juan",
      { mode: "iguales", method: "efectivo", parts: 1, totalParts: 4 },
      settings,
    );
    expect(iguales).toMatchObject({ ok: true, base: 8750 });
    const monto = previewGuestShare(
      bill,
      "juan",
      { mode: "monto", method: "efectivo", amount: 10000 },
      settings,
    );
    expect(monto).toMatchObject({ ok: true, base: 10000 });
  });

  it("el porcentaje no puede pasar el total que falta", () => {
    const bill = mkBill([payment({ base: 30000, total: 30000 })]);
    const preview = previewGuestShare(
      bill,
      "maria",
      { mode: "porcentaje", method: "efectivo", percent: 40 },
      settings,
    );
    expect(preview.ok).toBe(false);
    if (!preview.ok) expect(preview.reason).toBe("excede");
  });

  it("pagar todo cancela las partes definidas y cubre el total", () => {
    const bill = mkBill([payment()]);
    expect(bill.totals.available).toBe(22500);
    expect(payAllBase(bill)).toBe(35000);
    const preview = previewPayAll(bill, "maria", { method: "efectivo" }, settings);
    expect(preview).toMatchObject({ ok: true, base: 35000 });
  });

  it("definir no avisa al local: Cobrar ignora definido", () => {
    const bill = mkBill([payment()]);
    expect(guestBillRequests(bill)).toEqual([]);
    expect(myDefinedPayment(bill, "juan")?.base).toBe(12500);
    expect(billRequested(bill)).toBe(false);
  });

  it("mapBill lee el estado de la cuenta compartida", () => {
    const b = mapBill({
      sesion: {
        id: "s",
        local_id: "l",
        mesa_numero: 8,
        estado: "abierta",
        cuenta_estado: "dividiendo",
        cuenta_intencion: "dividir",
        cuenta_pagador_total_nombre: "María",
      },
      comensales: [],
      pedidos: [],
      pagos: [],
      totales: { consumo: 35000, disponible: 13000, base_comprometida: 22000 },
    });
    expect(b?.session.billState).toBe("dividiendo");
    expect(b?.session.intent).toBe("dividir");
    expect(b?.session.fullPayerName).toBe("María");
    expect(b?.totals.available).toBe(13000);
  });
});
