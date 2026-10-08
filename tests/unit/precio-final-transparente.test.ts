/**
 * El cliente ve, antes de confirmar, exactamente lo que se le va a cobrar.
 *
 * previewPayment es el espejo de _crear_pago_mesa / _propina_y_recargo: el
 * total que calcula viaja como monto_esperado y la base rechaza con
 * monto-cambio si el suyo es otro. Si los dos redondean distinto, el cliente
 * no puede pagar nunca; si el botón no muestra ese total, ve un número y
 * después la cuenta dice otro.
 */
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { translate } from "@/lib/i18n";
import {
  DEFAULT_PAYMENT_SETTINGS,
  formatMoney,
  percentOf,
  previewPayment,
  type PaymentSettings,
  type TableBill,
} from "@/lib/tableBill";

vi.mock("@/components/providers/Providers", () => ({
  useApp: () => ({
    t: (k: string, v?: Record<string, string | number>) => translate("es", k, v),
    locale: "es",
  }),
}));
vi.mock("@/components/ui/ThemedImg", () => ({ ThemedImg: () => null }));

import { PayScreen } from "@/components/customer/table/PayScreen";
import { paymentDatos, staffPaymentSchema } from "@/lib/schemas";

/* round(amount * pct / 100) de Postgres sobre numeric: producto exacto y .5
 * hacia arriba. pct con hasta dos decimales, como numeric(4,2). */
const postgres = (amount: number, pctCentesimos: number): number =>
  Math.floor((2 * amount * pctCentesimos + 10_000) / 20_000);

const bill = (consumption: number): TableBill => ({
  session: {
    id: "s1",
    branchId: "l1",
    tableId: "m1",
    tableNumber: 5,
    status: "abierta",
    splitMode: null,
    parts: null,
    version: 1,
    openedAt: "2026-10-08T20:00:00Z",
    updatedAt: "2026-10-08T20:00:00Z",
    paidAt: null,
    closedAt: null,
    closeReason: null,
    calledAt: null,
    billState: "dividiendo",
    intent: null,
    requestedAt: null,
    requestedBy: null,
    fullPayerId: null,
    fullPayerName: null,
  },
  guests: [{ id: "juan", name: "Juan", joinedAt: "", consumption }],
  orders: [],
  payments: [],
  totals: {
    consumption,
    tips: 0,
    surcharges: 0,
    total: consumption,
    paid: 0,
    pendingConfirmation: 0,
    paidBase: 0,
    committedBase: 0,
    committedParts: 0,
    uncovered: consumption,
    available: consumption,
  },
});

const tarjetas: PaymentSettings = {
  ...DEFAULT_PAYMENT_SETTINGS,
  debitSurchargePct: 0,
  creditSurchargePct: 10,
  surchargeDeclared: true,
};

describe("percentOf redondea igual que Postgres", () => {
  it("el caso que Math.round erraba: 25000 al 0,29% son $73, no $72", () => {
    expect(Math.round((25000 * 0.29) / 100)).toBe(72);
    expect(percentOf(25000, 0.29)).toBe(73);
  });

  it("todos los porcentajes de dos decimales del rango permitido (0,01 a 20)", () => {
    const bases = [1, 7, 99, 1250, 9999, 25000, 33333, 55000, 104999, 185000, 2_500_000];
    for (let pc = 1; pc <= 2000; pc++) {
      const pct = Number((pc / 100).toFixed(2));
      for (const b of bases) {
        expect(percentOf(b, pct), `${b} al ${pct}%`).toBe(postgres(b, pc));
      }
    }
  });

  it("porcentajes enteros de propina y 'pagar por porcentaje' con decimales", () => {
    expect(percentOf(10005, 5)).toBe(500);
    expect(percentOf(10010, 15)).toBe(1502);
    expect(percentOf(29000, 33.33)).toBe(9666);
    expect(percentOf(0, 10)).toBe(0);
  });
});

describe("el método elegido define el total antes de confirmar", () => {
  it("crédito con recargo: consumo + propina + recargo, y el total es la suma exacta", () => {
    const p = previewPayment(
      bill(10000),
      "juan",
      { mode: "uno", method: "tarjeta_credito", tipPercent: 10 },
      tarjetas,
    );
    expect(p).toMatchObject({ ok: true, base: 10000, tip: 1000, surchargePercent: 10 });
    if (!p.ok) return;
    expect(p.total).toBe(p.base + p.tip + p.surcharge);
  });

  it("el recargo es sobre el consumo: la propina no lo cambia", () => {
    const con = (tipPercent: 0 | 5 | 10 | 15) =>
      previewPayment(bill(10000), "juan", { mode: "uno", method: "tarjeta_credito", tipPercent }, tarjetas);
    expect(con(0)).toMatchObject({ ok: true, tip: 0, surcharge: 1000, total: 11000 });
    expect(con(10)).toMatchObject({ ok: true, tip: 1000, surcharge: 1000, total: 12000 });
    expect(con(15)).toMatchObject({ ok: true, tip: 1500, surcharge: 1000, total: 12500 });
  });

  it("al pasar a débito sin recargo el total baja en el acto", () => {
    const p = previewPayment(
      bill(10000),
      "juan",
      { mode: "uno", method: "tarjeta_debito", tipPercent: 10 },
      tarjetas,
    );
    expect(p).toMatchObject({ ok: true, surcharge: 0, total: 11000 });
  });
});

describe("el botón dice el importe final", () => {
  it("confirmar mi parte muestra el total que viaja como monto_esperado", () => {
    const b = bill(12000);
    const html = renderToStaticMarkup(
      createElement(PayScreen, {
        token: "t",
        bill: b,
        guestId: "juan",
        settings: { ...tarjetas, cash: false, debit: false },
        mercadoPagoReady: false,
        onBill: () => {},
        onStale: () => {},
      }),
    );
    const p = previewPayment(b, "juan", { mode: "consumo", method: "tarjeta_credito" }, tarjetas);
    expect(p.ok && p.total).toBe(13200);
    expect(html).toContain(translate("es", "mesa.definirParteN", { n: formatMoney(13200) }));
    expect(html).toContain(translate("es", "mesa.lineaRecargo", { n: 10 }));
  });
});

describe("el panel también confirma el importe que ve", () => {
  const base = {
    key: "7d6f0a3e-4b2c-4c1a-9a7e-2b1f3c4d5e6f",
    mode: "monto" as const,
    method: "tarjeta_credito" as const,
    amount: 10000,
    payerName: "Mesa 3",
  };

  it("sin el total esperado el cobro no sale", () => {
    expect(staffPaymentSchema.safeParse(base).success).toBe(false);
  });

  it("el total viaja como monto_esperado, que valida _crear_pago_mesa", () => {
    const v = staffPaymentSchema.parse({ ...base, expectedTotal: 11000 });
    expect(paymentDatos(v)).toMatchObject({ monto: 10000, monto_esperado: 11000, modo: "monto" });
  });
});
