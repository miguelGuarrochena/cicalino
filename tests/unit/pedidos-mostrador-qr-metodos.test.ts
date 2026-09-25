import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { counterPayOptions } from "@/lib/tablePickup";
import { DEFAULT_PAYMENT_SETTINGS, type PaymentSettings } from "@/lib/tableBill";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const sql = read("supabase/pedidos-mostrador-qr-metodos.sql");
const funcion = (nombre: string) => {
  const inicio = sql.indexOf(`create or replace function public.${nombre}(`);
  expect(inicio).toBeGreaterThan(-1);
  return sql.slice(inicio, sql.indexOf("\n$$;", inicio));
};

const nada: PaymentSettings = {
  ...DEFAULT_PAYMENT_SETTINGS,
  cash: false,
  debit: false,
  credit: false,
  transfer: false,
  mpQr: false,
  mercadoPago: false,
};

describe("Mostrador QR — qué formas de pago se ofrecen", () => {
  it("solo Efectivo → Pagar en caja", () => {
    expect(counterPayOptions({ ...nada, cash: true }, false)).toEqual({ caja: true, mercadoPago: false });
  });

  it("Efectivo + Mercado Pago → Pagar en caja + Mercado Pago", () => {
    expect(counterPayOptions({ ...nada, cash: true, mercadoPago: true }, true)).toEqual({
      caja: true,
      mercadoPago: true,
    });
  });

  it("solo Mercado Pago → solamente Mercado Pago", () => {
    expect(counterPayOptions({ ...nada, mercadoPago: true }, true)).toEqual({
      caja: false,
      mercadoPago: true,
    });
  });

  it("ningún método → nada que ofrecer", () => {
    expect(counterPayOptions(nada, false)).toEqual({ caja: false, mercadoPago: false });
  });

  it("cualquier método presencial habilita la caja; Mercado Pago no", () => {
    for (const k of ["cash", "debit", "credit", "transfer", "mpQr"] as const) {
      expect(counterPayOptions({ ...nada, [k]: true }, false).caja).toBe(true);
    }
    expect(counterPayOptions({ ...nada, mercadoPago: true }, true).caja).toBe(false);
  });

  it("por defecto (sin configurar) Efectivo está habilitado", () => {
    expect(DEFAULT_PAYMENT_SETTINGS.cash).toBe(true);
    expect(counterPayOptions(DEFAULT_PAYMENT_SETTINGS, false).caja).toBe(true);
  });
});

describe("pedidos-mostrador-qr-metodos.sql — la base lo exige", () => {
  it("va después de pedidos-mostrador-qr.sql y está en el chequeo", () => {
    const orden = JSON.parse(read("supabase/orden.json")) as string[];
    expect(orden.indexOf("pedidos-mostrador-qr-metodos.sql")).toBe(
      orden.indexOf("pedidos-mostrador-qr.sql") + 1,
    );
    const chequeo = read("supabase/chequeo-migraciones.sql");
    expect(chequeo).toContain("('pedidos-mostrador-qr-metodos.sql', 'pedidos-mostrador-qr.sql')");
    expect(chequeo).toContain("'trigger', 'locales_mostrador_qr_metodos'");
  });

  it("la caja son los métodos presenciales reales del local, no Mercado Pago", () => {
    const caja = funcion("_mostrador_caja_habilitada");
    expect(caja).toContain("'efectivo', 'tarjeta_debito', 'tarjeta_credito'");
    expect(caja).toContain("'transferencia', 'qr_mercado_pago'");
    expect(caja).not.toContain("'mercado_pago',");
    expect(caja).toContain("public._metodo_mesa_habilitado(p_local, m, 'personal')");
    expect(funcion("_mostrador_metodos_ok")).toContain(
      "public._metodo_mesa_habilitado(p_local, 'mercado_pago', 'comensal')",
    );
  });

  it("no se activa Mostrador QR sin métodos", () => {
    const guard = funcion("locales_mostrador_qr_metodos_guard");
    expect(guard).toContain("not public._mostrador_metodos_ok(new.id)");
    expect(guard).toContain("hint = 'sin-metodos'");
    expect(sql).toContain("before update of pedidos_modalidad on public.locales");
  });

  it("sin métodos no se inicia nada; caja solo con un método presencial", () => {
    expect(funcion("unirse_mostrador_qr")).toContain("'sin-metodos'");
    const pedir = funcion("pedir_mostrador_qr");
    expect(pedir).toContain("'sin-metodos'");
    expect(pedir).toContain(
      "if p_metodo = 'caja' and not public._mostrador_caja_habilitada(v_s.local_id) then",
    );
    /* El reintento del mismo carrito devuelve el pedido antes de mirar métodos. */
    expect(pedir.indexOf("clave_idempotencia = p_clave")).toBeLessThan(pedir.indexOf("'sin-metodos'"));
    const pagar = funcion("pagar_pedido_autoservicio");
    expect(pagar).toContain(
      "if v_flujo = 'mostrador_qr' and not public._mostrador_caja_habilitada(v_p.local_id) then",
    );
  });

  it("las funciones son solo del servidor", () => {
    expect(sql).toContain(
      "revoke all on function public._mostrador_metodos_ok(uuid) from public, anon, authenticated;",
    );
    expect(sql).toContain(
      "grant execute on function public.pedir_mostrador_qr(text, uuid, text, jsonb, uuid, text, text) to service_role;",
    );
  });
});

describe("Mostrador QR — la pantalla y la configuración usan la configuración real", () => {
  it("la página calcula la caja desde los métodos del local; la mesa no cambia", () => {
    const page = read("src/app/(customer)/m/[token]/page.tsx");
    expect(page).toContain("counterPayOptions(payment.settings, mercadoPagoReady).caja");
    expect(page).toContain(': true;');
  });

  it("el botón de caja y el de Mercado Pago aparecen solo si corresponden", () => {
    const app = read("src/components/customer/table/TablePickupApp.tsx");
    expect(app).toContain("{cashReady && (");
    expect(app).toContain("{mercadoPagoReady && (");
    expect(app).toContain("const sinMetodos = counter && !initial.cashReady && !initial.mercadoPagoReady;");
    expect(read("src/components/customer/table/PickupOrderCard.tsx")).toContain("{cashReady && (");
  });

  it("los textos de cómo pagar dicen solo lo que el local ofrece", () => {
    const app = read("src/components/customer/table/TablePickupApp.tsx");
    expect(app).toContain('cash && !mp ? "Caja" : mp && !cash ? "Mp" : ""');
    expect(app).toContain("`mostradorQr.confirmarPedidoAyuda${pagoTexto}`");
    expect(app).toContain("`mostradorQr.seEnviaYa${counterPayTextKey(cashReady, mercadoPagoReady)}`");
    const i18n = read("src/lib/i18n.ts");
    for (const k of ["paso2Caja", "paso2Mp", "confirmarPedidoAyudaCaja", "confirmarPedidoAyudaMp", "seEnviaYaCaja", "seEnviaYaMp"]) {
      expect(i18n.split(`      ${k}:`).length - 1, k).toBe(2);
    }
    /* El cartel impreso no promete Mercado Pago. */
    expect(i18n).not.toContain('pediNota: "Mercado Pago');
  });

  it("Configuración no deja activar Mostrador QR sin métodos y lo explica", () => {
    const cfg = read("src/app/(app)/panel/config/page.tsx");
    expect(cfg).toContain("if (qrMostradorBorrador && !qrMostradorGuardado && sinMetodos) {");
    expect(cfg).toContain('t("retiroConfig.mostradorQrSinMetodos")');
    expect(cfg).toContain('t("retiroConfig.mostradorQrPausado")');
    expect(cfg).toContain("onMethodsChange={setMetodos}");
  });
});
