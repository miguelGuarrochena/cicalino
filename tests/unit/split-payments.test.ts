import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseSignatureHeader,
  signatureManifest,
  verifyMercadoPagoSignature,
} from "@/lib/mpSignature";
import {
  guestOrderSchema,
  guestPaymentSchema,
  leadSchema,
  paymentDatos,
  paymentSettingsSchema,
  staffPaymentSchema,
} from "@/lib/schemas";
import {
  PACK_IDS,
  PACK_PRICES,
  SOLO_PACKS,
  COMBO_PACKS,
  isPackId,
  modulesForPack,
  normalizeModules,
  packIdFor,
} from "@/lib/pricing";
import { leadToOrgPayload } from "@/lib/leadToOrg";
import { DEFAULT_PAYMENT_SETTINGS } from "@/lib/tableBill";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const uuid = () => crypto.randomUUID();

describe("Mercado Pago — firma del webhook", () => {
  const secret = "test-secret";
  const sign = (manifest: string) =>
    crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  it("acepta la firma armada con id, request-id y ts", () => {
    const v1 = sign("id:123456;request-id:req-1;ts:1704908010;");
    expect(
      verifyMercadoPagoSignature({
        header: `ts=1704908010,v1=${v1}`,
        requestId: "req-1",
        dataId: "123456",
        secret,
      }),
    ).toBe(true);
  });

  it("rechaza otro id, otro secreto o una firma mal formada", () => {
    const v1 = sign("id:123456;request-id:req-1;ts:1704908010;");
    const base = { header: `ts=1704908010,v1=${v1}`, requestId: "req-1", dataId: "123456", secret };
    expect(verifyMercadoPagoSignature({ ...base, dataId: "999" })).toBe(false);
    expect(verifyMercadoPagoSignature({ ...base, secret: "otro" })).toBe(false);
    expect(verifyMercadoPagoSignature({ ...base, header: "ts=1,v1=zz" })).toBe(false);
    expect(verifyMercadoPagoSignature({ ...base, header: null })).toBe(false);
    expect(verifyMercadoPagoSignature({ ...base, secret: "" })).toBe(false);
  });

  it("la ruta firma con el id del cuerpo cuando la URL no lo trae", () => {
    const route = read("src/app/api/mp/webhook/route.ts");
    expect(route).toMatch(/const dataId = queryId \?\? bodyId;/);
    expect(route).toMatch(/verifyMercadoPagoSignature\(\{ header, requestId, dataId, secret \}\)/);
  });

  it("id alfanumérico en minúscula y partes ausentes fuera del manifest", () => {
    expect(signatureManifest({ dataId: "ABC123", requestId: null, ts: "1" })).toBe("id:abc123;ts:1;");
    expect(parseSignatureHeader("v1=abc")).toBeNull();
  });
});

describe("Pagos divididos — esquemas", () => {
  it("un pedido no repite productos ni supera 50 unidades", () => {
    const p = uuid();
    expect(guestOrderSchema.safeParse({ key: uuid(), items: [{ productId: p, quantity: 2 }] }).success).toBe(true);
    expect(
      guestOrderSchema.safeParse({ key: uuid(), items: [{ productId: p, quantity: 1 }, { productId: p, quantity: 1 }] }).success,
    ).toBe(false);
    expect(guestOrderSchema.safeParse({ key: uuid(), items: [{ productId: p, quantity: 51 }] }).success).toBe(false);
  });

  it("el personal no puede registrar un pago de Mercado Pago", () => {
    expect(
      staffPaymentSchema.safeParse({ key: uuid(), mode: "uno", method: "mercado_pago", payerName: "Ana" }).success,
    ).toBe(false);
  });

  it("la propina en porcentaje gana sobre el monto, igual que en SQL", () => {
    const v = guestPaymentSchema.parse({
      key: uuid(),
      mode: "consumo",
      method: "efectivo",
      tipPercent: 10,
      tipAmount: 500,
      expectedTotal: 13200,
    });
    const d = paymentDatos(v);
    expect(d).toMatchObject({ modo: "consumo", metodo: "efectivo", propina_porcentaje: 10, monto_esperado: 13200 });
    expect(d).not.toHaveProperty("propina_monto");
  });

  it("transferencia exige alias y titular; recargo exige la declaración", () => {
    const base = { ...DEFAULT_PAYMENT_SETTINGS };
    expect(paymentSettingsSchema.safeParse({ ...base, transfer: true }).success).toBe(false);
    expect(
      paymentSettingsSchema.safeParse({ ...base, transfer: true, transferAlias: "resto.xyz", transferHolder: "Resto" }).success,
    ).toBe(true);
    expect(paymentSettingsSchema.safeParse({ ...base, creditSurchargePct: 3 }).success).toBe(false);
    expect(paymentSettingsSchema.safeParse({ ...base, creditSurchargePct: 3, surchargeDeclared: true }).success).toBe(true);
    expect(paymentSettingsSchema.safeParse({ ...base, transferCbu: "123" }).success).toBe(false);
  });
});

describe("Pagos divididos — módulo comercial", () => {
  it("los precios comerciales de la landing coinciden con cada pack", () => {
    expect(PACK_PRICES).toEqual({
      pedidos: 20_000,
      espera: 10_000,
      pagos: 15_000,
      pack: 25_000,
      espera_pagos: 22_000,
      pedidos_pagos: 30_000,
      completo: 35_000,
    });
    expect([...SOLO_PACKS, ...COMBO_PACKS].sort()).toEqual([...PACK_IDS].sort());
  });

  it("cada combinación de módulos tiene un pack y vuelve a la misma", () => {
    for (const id of PACK_IDS) {
      expect(packIdFor(modulesForPack(id))).toBe(id);
    }
    expect(packIdFor({ pedidos: true, espera: true, pagos: false })).toBe("pack");
  });

  it("una solicitud del pack completo habilita los tres módulos", () => {
    const lead = leadSchema.safeParse({
      name: "Juan Pérez",
      email: "juan@ejemplo.com",
      telefono: "3415551234",
      cuil: "20123456789",
      local: "La Esquina",
      tipo: "contrato",
      plan: "mensual",
      pack: "completo",
    });
    expect(lead.success).toBe(true);
    const p = leadToOrgPayload({ nombre: "Juan", email: "juan@ejemplo.com", tipo: "contrato", pack: "completo", local: "La Esquina" });
    expect(p).toMatchObject({ moduloPedidos: true, moduloEspera: true, moduloPagos: true });
    expect(isPackId("todo")).toBe(false);
  });

  it("una sucursal nunca queda sin módulos", () => {
    expect(normalizeModules({ pedidos: false, espera: false, pagos: false })).toEqual({ pedidos: true, espera: false, pagos: false });
    expect(normalizeModules({ pedidos: false, pagos: true })).toEqual({ pedidos: false, espera: false, pagos: true });
  });

  it("la base impide que alguien que no es superadmin cambie módulos", () => {
    const sql = read("supabase/split-payments-module.sql");
    expect(sql).toMatch(/create trigger locales_proteger_modulos\s+before update on public\.locales/);
    expect(sql).toContain("new.modulo_pagos is distinct from old.modulo_pagos");
    expect(sql).toContain("'completo'");
  });
});

describe("Pagos divididos — superficie de seguridad del SQL", () => {
  const sql = read("supabase/split-payments.sql");

  it("las funciones del comensal y del webhook son solo de service_role", () => {
    for (const fn of [
      "unirse_mesa(text, text, text)",
      "cuenta_comensal(uuid, text)",
      "pedir_como_comensal(uuid, text, jsonb, uuid)",
      "pagar_como_comensal(uuid, text, jsonb)",
      "mp_confirmar_pago(uuid, uuid, text, text, numeric, text)",
    ]) {
      expect(sql).toContain(`revoke all on function public.${fn} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${fn} to service_role;`);
    }
  });

  it("la confirmación manual nunca aplica a Mercado Pago", () => {
    expect(sql).toMatch(/if v_p\.metodo = 'mercado_pago' then\s+return json_build_object\('ok', false, 'reason', 'mp-solo-webhook'\)/);
    expect(sql).toContain("confirmacion = case when metodo = 'mercado_pago' then 'webhook' else 'manual' end");
  });

  it("los pagos se crean con la sesión bloqueada y validando el saldo", () => {
    expect(sql).toMatch(/select \* into v_s from public\.mesa_sesiones where id = p_sesion for update;/);
    expect(sql).toContain("'reason', 'excede'");
    expect(sql).toContain("'reason', 'monto-cambio'");
  });

  it("mp_cuentas y el hash del comensal no quedan expuestos", () => {
    expect(sql).toMatch(/revoke all on table public\.productos, public\.local_cobros, public\.mp_cuentas,/);
    expect(sql).toContain("grant select (id, sesion_id, local_id, nombre, creado_en, visto_en)");
    expect(sql).not.toMatch(/grant [^;]*on public\.mp_cuentas to authenticated/);
  });

  it("el alias de transferencia solo lo cambia el dueño", () => {
    expect(sql).toMatch(/create policy "cobros actualizar dueno"[\s\S]*auth_rol\(\)::text in \('admin', 'superadmin'\)/);
  });

  it("el tablero de mostrador sigue igual para los pedidos de siempre", () => {
    expect(sql).toMatch(/where local_id = p_local\s+and creado_en >= v_desde\s+and sesion_id is null/);
  });

  it("orden.json corre el módulo antes que las tablas", () => {
    const orden: string[] = JSON.parse(read("supabase/orden.json"));
    expect(orden.indexOf("split-payments-module.sql")).toBeLessThan(orden.indexOf("split-payments.sql"));
    expect(orden.indexOf("pedidos-avisos-activos.sql")).toBeLessThan(orden.indexOf("split-payments.sql"));
  });

  it("el webhook valida firma y consulta el pago a Mercado Pago antes de confirmar", () => {
    const route = read("src/app/api/mp/webhook/route.ts");
    const firma = route.indexOf("verifyMercadoPagoSignature(");
    const consulta = route.indexOf("fetchPayment(");
    const confirma = route.indexOf("confirmMercadoPagoPayment(");
    expect(firma).toBeGreaterThan(-1);
    expect(firma).toBeLessThan(consulta);
    expect(consulta).toBeLessThan(confirma);
  });

  it("las rutas del comensal usan rate limit y chequean el origen al escribir", () => {
    const guard = read("src/lib/server/guestApi.ts");
    expect(guard).toContain("sharedRateLimit");
    expect(guard).toContain("clientIp");
    expect(guard).toContain("sameOrigin");
    for (const rel of [
      "src/app/api/m/[token]/unirse/route.ts",
      "src/app/api/m/[token]/restaurar/route.ts",
      "src/app/api/m/[token]/pedidos/route.ts",
      "src/app/api/m/[token]/pagos/route.ts",
      "src/app/api/m/[token]/pagos/[pagoId]/cancelar/route.ts",
      "src/app/api/m/[token]/llamar/route.ts",
    ]) {
      expect(read(rel)).toContain("mutating: true");
    }
  });
});
