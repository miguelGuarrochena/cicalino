/**
 * "Mostrar propina al cliente" (local_cobros.propina_habilitada).
 *
 * Prendida, todo queda como estaba. Apagada, el comensal no ve la propina y
 * la vista previa la descarta igual que la base (_crear_pago_mesa y
 * _propina_y_recargo): si no coincidieran, el comensal recibiría siempre
 * "monto-cambio". El personal puede seguir cargando una propina.
 */
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { translate } from "@/lib/i18n";
import {
  DEFAULT_PAYMENT_SETTINGS,
  mapPaymentSettings,
  previewGuestShare,
  previewPayAll,
  previewPayment,
  type PaymentSettings,
  type TableBill,
} from "@/lib/tableBill";
import { paymentSettingsSchema } from "@/lib/schemas";

vi.mock("@/components/providers/Providers", () => ({
  useApp: () => ({
    t: (k: string, v?: Record<string, string | number>) => translate("es", k, v),
    locale: "es",
  }),
}));
/* El spinner usa next/image, que necesita DOM; no hace al contenido. */
vi.mock("@/components/ui/ThemedImg", () => ({ ThemedImg: () => null }));

import { PayScreen } from "@/components/customer/table/PayScreen";

const mkBill = (billState: TableBill["session"]["billState"] = "abierta"): TableBill => ({
  session: {
    id: "s1",
    branchId: "l1",
    tableId: "m1",
    tableNumber: 5,
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
    billState,
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
  orders: [],
  payments: [],
  totals: {
    consumption: 29000,
    tips: 0,
    surcharges: 0,
    total: 29000,
    paid: 0,
    pendingConfirmation: 0,
    paidBase: 0,
    committedBase: 0,
    committedParts: 0,
    uncovered: 29000,
    available: 29000,
  },
});

const on: PaymentSettings = { ...DEFAULT_PAYMENT_SETTINGS, creditSurchargePct: 3, surchargeDeclared: true };
const off: PaymentSettings = { ...on, tipsEnabled: false };

describe("propina_habilitada en la configuración", () => {
  it("el default es prendida, con o sin fila de local_cobros", () => {
    expect(DEFAULT_PAYMENT_SETTINGS.tipsEnabled).toBe(true);
    expect(mapPaymentSettings(null).tipsEnabled).toBe(true);
    /* Fila sin la columna (base sin la migración o select viejo). */
    expect(mapPaymentSettings({ acepta_efectivo: true }).tipsEnabled).toBe(true);
  });

  it("mapPaymentSettings lee la columna", () => {
    expect(mapPaymentSettings({ propina_habilitada: true }).tipsEnabled).toBe(true);
    expect(mapPaymentSettings({ propina_habilitada: false }).tipsEnabled).toBe(false);
  });

  it("el schema del panel la acepta y la completa en true si falta", () => {
    const { tipsEnabled: _, ...sinCampo } = DEFAULT_PAYMENT_SETTINGS;
    const parsed = paymentSettingsSchema.safeParse(sinCampo);
    expect(parsed.success && parsed.data.tipsEnabled).toBe(true);
    const apagada = paymentSettingsSchema.safeParse({ ...DEFAULT_PAYMENT_SETTINGS, tipsEnabled: false });
    expect(apagada.success && apagada.data.tipsEnabled).toBe(false);
  });
});

describe("previewPayment con la propina prendida o apagada", () => {
  it("prendida: igual que siempre (porcentaje y otro monto)", () => {
    expect(previewPayment(mkBill(), "juan", { mode: "consumo", method: "efectivo", tipPercent: 10 }, on))
      .toMatchObject({ ok: true, base: 12000, tip: 1200, total: 13200 });
    expect(previewPayment(mkBill(), "juan", { mode: "consumo", method: "efectivo", tipAmount: 500 }, on))
      .toMatchObject({ ok: true, base: 12000, tip: 500, total: 12500 });
  });

  it("apagada: ignora tipPercent", () => {
    expect(previewPayment(mkBill(), "juan", { mode: "consumo", method: "efectivo", tipPercent: 10 }, off))
      .toMatchObject({ ok: true, base: 12000, tip: 0, total: 12000 });
  });

  it("apagada: ignora tipAmount, aunque sea inválido", () => {
    expect(previewPayment(mkBill(), "juan", { mode: "consumo", method: "efectivo", tipAmount: 500 }, off))
      .toMatchObject({ ok: true, base: 12000, tip: 0, total: 12000 });
    expect(previewPayment(mkBill(), "juan", { mode: "consumo", method: "efectivo", tipAmount: 99999 }, off))
      .toMatchObject({ ok: true, tip: 0, total: 12000 });
  });

  it("apagada: el total sin propina mantiene el recargo de tarjeta", () => {
    expect(previewPayment(mkBill(), "maria", { mode: "consumo", method: "tarjeta_credito", tipPercent: 15 }, off))
      .toMatchObject({ ok: true, base: 17000, tip: 0, surcharge: 510, total: 17510 });
  });

  it("apagada: pagar todo y definir mi parte tampoco suman propina", () => {
    expect(previewPayAll(mkBill(), "juan", { method: "efectivo", tipPercent: 10 }, off))
      .toMatchObject({ ok: true, base: 29000, tip: 0, total: 29000 });
    expect(previewGuestShare(mkBill(), "juan", { mode: "consumo", method: "efectivo", tipAmount: 1000 }, off))
      .toMatchObject({ ok: true, base: 12000, tip: 0, total: 12000 });
  });

  it("apagada: el personal sigue pudiendo registrar una propina", () => {
    expect(
      previewPayment(
        mkBill(),
        null,
        { mode: "monto", method: "efectivo", amount: 10000, tipAmount: 800 },
        off,
        new Date(),
        "personal",
      ),
    ).toMatchObject({ ok: true, base: 10000, tip: 800, total: 10800 });
  });
});

describe("la base descarta la propina del comensal", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/propina-habilitada.sql"), "utf8");
  const funcion = (nombre: string) => {
    const inicio = sql.indexOf(`create or replace function public.${nombre}(`);
    expect(inicio).toBeGreaterThan(-1);
    return sql.slice(inicio, sql.indexOf("\n$$;", inicio));
  };

  it("la columna nace prendida para todos los locales", () => {
    expect(sql).toMatch(/add column if not exists propina_habilitada boolean not null default true/);
    expect(sql).not.toMatch(/update public\.pagos_mesa/);
  });

  it("_crear_pago_mesa: solo para el comensal, antes de calcular la propina", () => {
    const f = funcion("_crear_pago_mesa");
    const guarda = f.indexOf("if p_actor = 'comensal' and not v_cobros.propina_habilitada then");
    expect(guarda).toBeGreaterThan(-1);
    expect(f.slice(guarda)).toMatch(/p_datos := p_datos - 'propina_porcentaje' - 'propina_monto';/);
    expect(guarda).toBeLessThan(f.indexOf("/* Tip: per person"));
    /* Sin fila de local_cobros, prendida. */
    expect(f).toContain("v_cobros.propina_habilitada := true;");
  });

  it("_propina_y_recargo: descarta antes de leer la propina", () => {
    const f = funcion("_propina_y_recargo");
    const guarda = f.indexOf("not c.propina_habilitada");
    expect(guarda).toBeGreaterThan(-1);
    expect(guarda).toBeLessThan(f.indexOf("p_datos->>'propina_porcentaje'"));
  });

  it("queda registrada en orden.json y en el chequeo de migraciones", () => {
    const orden = JSON.parse(readFileSync(join(process.cwd(), "supabase/orden.json"), "utf8")) as string[];
    expect(orden.indexOf("propina-habilitada.sql")).toBeGreaterThan(orden.indexOf("mostrador-qr-pago-previo.sql"));
    expect(orden.indexOf("propina-habilitada.sql")).toBeGreaterThan(orden.indexOf("mesa-cuenta-compartida.sql"));
    expect(readFileSync(join(process.cwd(), "supabase/chequeo-migraciones.sql"), "utf8")).toContain(
      "('propina-habilitada.sql', 'column', 'local_cobros.propina_habilitada'",
    );
  });
});

describe("PayScreen", () => {
  const render = (settings: PaymentSettings) =>
    renderToStaticMarkup(
      createElement(PayScreen, {
        token: "t",
        bill: mkBill("dividiendo"),
        guestId: "juan",
        settings,
        mercadoPagoReady: false,
        onBill: () => {},
        onStale: () => {},
      }),
    );

  it("prendida: muestra el selector de propina", () => {
    const html = render(on);
    expect(html).toContain(`>${translate("es", "mesa.propinaTitulo")}<`);
    expect(html).toContain(translate("es", "mesa.sinPropina"));
    expect(html).toContain("15%");
  });

  it("apagada: no muestra la propina, sí los métodos de pago", () => {
    const html = render(off);
    expect(html).not.toContain(`>${translate("es", "mesa.propinaTitulo")}<`);
    expect(html).not.toContain(translate("es", "mesa.sinPropina"));
    expect(html).not.toContain(translate("es", "mesa.otroMonto"));
    expect(html).not.toContain("15%");
    expect(html).toContain(translate("es", "mesa.metodoTitulo"));
  });
});
