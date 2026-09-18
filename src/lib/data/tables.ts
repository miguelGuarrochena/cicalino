"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { debounced, watchChannel } from "@/lib/realtime";
import { ok, fail, desdeSupabase, type DataResult } from "@/lib/data/result";
import { reportError } from "@/lib/observability";
import {
  parseInput,
  paymentDatos,
  paymentSettingsSchema,
  staffPaymentSchema,
} from "@/lib/schemas";
import {
  mapBill,
  mapPaymentSettings,
  type PaymentSettings,
  type TableBill,
} from "@/lib/tableBill";
import type { z } from "zod";

/* Panel side of split payments. Reads go through RLS with the staff session;
 * every mutation of bills and payments is an RPC that re-checks access,
 * module and subscription (supabase/split-payments.sql). */

type RpcOutcome = { ok: true; data: Record<string, unknown> } | { ok: false; reason: string };

const rpc = async (
  fn: string,
  args: Record<string, unknown>,
  scope: string,
): Promise<RpcOutcome> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return { ok: false, reason: "not-configured" };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    reportError(scope, error, args);
    return { ok: false, reason: error.code === "42501" ? "permiso" : "error" };
  }
  const r = (data ?? {}) as Record<string, unknown>;
  return r.ok === false
    ? { ok: false, reason: String(r.reason ?? "error") }
    : { ok: true, data: r };
};

/* ---- Bills ---------------------------------------------------------------- */

export const fetchTableBills = async (
  branchId: string,
): Promise<DataResult<TableBill[]>> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return ok([]);
  const { data, error } = await supabase.rpc("mesas_cuentas", { p_local: branchId });
  if (error) {
    reportError("panel.mesas.cuentas", error, { branchId });
    return fail(desdeSupabase(error));
  }
  return ok(
    ((data as unknown[] | null) ?? [])
      .map(mapBill)
      .filter((b): b is TableBill => b !== null),
  );
};

/* Every write to a bill bumps mesa_sesiones.version, so one table is enough
 * to hear about orders, payments, waiter calls and webhook confirmations.
 * The Realtime filter is local_id: mesa-sesiones-realtime.sql sets replica
 * identity FULL so UPDATE events include that column. */
export const subscribeTableBills = (
  branchId: string,
  onChange: () => void,
): { unsubscribe: () => void; isHealthy: () => boolean } => {
  const supabase = createBrowserSupabase();
  if (!supabase) return { unsubscribe: () => {}, isHealthy: () => false };

  const fire = debounced(onChange);
  let channel: RealtimeChannel | null = null;
  let watcher: { state: { healthy: boolean }; dispose: () => void } | null = null;
  let disposed = false;

  const connect = () => {
    if (disposed) return;
    if (channel) void supabase.removeChannel(channel);
    watcher?.dispose();
    channel = supabase.channel(`table-bills-${branchId}`).on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "mesa_sesiones",
        filter: `local_id=eq.${branchId}`,
      },
      fire,
    );
    watcher = watchChannel(channel, connect, fire);
  };

  connect();

  return {
    unsubscribe: () => {
      disposed = true;
      watcher?.dispose();
      if (channel) void supabase.removeChannel(channel);
    },
    isHealthy: () => watcher?.state.healthy ?? false,
  };
};

export const confirmTablePayment = (paymentId: string, employeeId: string | null) =>
  rpc("confirmar_pago_mesa", { p_pago: paymentId, p_empleado: employeeId }, "panel.mesas.confirmar");

export const cancelTablePayment = (
  paymentId: string,
  reason: string | null,
  employeeId: string | null,
) =>
  rpc(
    "cancelar_pago_mesa",
    { p_pago: paymentId, p_motivo: reason, p_empleado: employeeId },
    "panel.mesas.cancelar-pago",
  );

export const registerStaffPayment = async (
  sessionId: string,
  draft: z.input<typeof staffPaymentSchema>,
  employeeId: string | null,
): Promise<RpcOutcome> => {
  const v = parseInput(staffPaymentSchema, draft);
  if (!v.ok) return { ok: false, reason: "datos-invalidos" };
  return rpc(
    "registrar_pago_personal",
    { p_sesion: sessionId, p_datos: paymentDatos(v.data), p_empleado: employeeId },
    "panel.mesas.registrar-pago",
  );
};

export const closeTable = (sessionId: string, reason: string | null, employeeId: string | null) =>
  rpc(
    "cerrar_mesa",
    { p_sesion: sessionId, p_motivo: reason, p_empleado: employeeId },
    "panel.mesas.cerrar",
  );

export const acknowledgeWaiterCall = (sessionId: string) =>
  rpc("atender_llamado_mesa", { p_sesion: sessionId }, "panel.mesas.atender-llamado");

/* ---- Tables and QR ---------------------------------------------------------- */

export interface TableQrView {
  id: string;
  number: number;
  qrToken: string;
  generatedAt: string | null;
  qrActive: boolean;
}

export const fetchTableQrs = async (branchId: string): Promise<DataResult<TableQrView[]>> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return ok([]);
  const { data, error } = await supabase
    .from("mesas")
    .select("id, numero, qr_token, qr_generado_en, qr_activo")
    .eq("local_id", branchId)
    .order("numero");
  if (error) {
    reportError("panel.mesas.qr", error, { branchId });
    return fail(desdeSupabase(error));
  }
  return ok(
    (data ?? []).map((m) => ({
      id: m.id as string,
      number: m.numero as number,
      qrToken: m.qr_token as string,
      generatedAt: (m.qr_generado_en as string | null) ?? null,
      qrActive: Boolean(m.qr_activo),
    })),
  );
};

export const setTableQrs = (
  branchId: string,
  active: boolean,
  ids: string[] | null = null,
) =>
  rpc(
    "set_mesas_qr",
    { p_local: branchId, p_activo: active, p_ids: ids },
    "panel.mesas.set-qr",
  );

export const regenerateTableQr = (tableId: string) =>
  rpc("regenerar_qr_mesa", { p_mesa: tableId }, "panel.mesas.regenerar-qr");

/* ---- Menu ---------------------------------------------------------------- */

export {
  fetchMenuProducts,
  saveMenuProduct,
  deleteMenuProduct,
  type MenuProductView,
  type SaveProductResult,
} from "@/lib/data/menu";

/* ---- Payment settings ------------------------------------------------------- */

export interface PaymentSettingsView {
  settings: PaymentSettings;
  surchargeDeclaredAt: string | null;
  mercadoPago: { connected: boolean; userId: string | null; expiresAt: string | null };
}

export const fetchPaymentSettings = async (
  branchId: string,
): Promise<DataResult<PaymentSettingsView>> => {
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return ok({
      settings: mapPaymentSettings(null),
      surchargeDeclaredAt: null,
      mercadoPago: { connected: false, userId: null, expiresAt: null },
    });
  }
  const [cobros, mp] = await Promise.all([
    supabase
      .from("local_cobros")
      .select(
        "acepta_mercado_pago, acepta_transferencia, acepta_efectivo, acepta_qr_mercado_pago, acepta_debito, acepta_credito, transferencia_alias, transferencia_titular, transferencia_cbu, recargo_debito_pct, recargo_credito_pct, recargo_declarado, recargo_declarado_en",
      )
      .eq("local_id", branchId)
      .maybeSingle(),
    supabase.rpc("mp_estado_local", { p_local: branchId }),
  ]);
  const error = cobros.error ?? mp.error;
  if (error) {
    reportError("panel.cobros.leer", error, { branchId });
    return fail(desdeSupabase(error));
  }
  const m = (mp.data ?? {}) as Record<string, unknown>;
  return ok({
    settings: mapPaymentSettings(cobros.data as Record<string, unknown> | null),
    surchargeDeclaredAt:
      ((cobros.data as Record<string, unknown> | null)?.recargo_declarado_en as string | null) ??
      null,
    mercadoPago: {
      connected: Boolean(m.conectado),
      userId: (m.mp_user_id as string | null) ?? null,
      expiresAt: (m.expira_en as string | null) ?? null,
    },
  });
};

export const savePaymentSettings = async (
  branchId: string,
  input: PaymentSettings,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return { ok: false, message: "Sin conexión." };
  const v = parseInput(paymentSettingsSchema, input);
  if (!v.ok) return { ok: false, message: v.error };
  const { error } = await supabase.from("local_cobros").upsert(
    {
      local_id: branchId,
      acepta_mercado_pago: v.data.mercadoPago,
      acepta_transferencia: v.data.transfer,
      acepta_efectivo: v.data.cash,
      acepta_qr_mercado_pago: v.data.mpQr,
      acepta_debito: v.data.debit,
      acepta_credito: v.data.credit,
      transferencia_alias: v.data.transferAlias ?? null,
      transferencia_titular: v.data.transferHolder ?? null,
      transferencia_cbu: v.data.transferCbu ?? null,
      recargo_debito_pct: v.data.debitSurchargePct,
      recargo_credito_pct: v.data.creditSurchargePct,
      recargo_declarado: v.data.surchargeDeclared,
    },
    { onConflict: "local_id" },
  );
  if (error) {
    reportError("panel.cobros.guardar", error, { branchId });
    return {
      ok: false,
      message: error.message.includes("Mercado Pago")
        ? "Conectá la cuenta de Mercado Pago antes de activarlo."
        : error.code === "42501"
          ? "Solo el dueño puede cambiar los métodos de pago."
          : "No se pudieron guardar los métodos de pago.",
    };
  }
  return { ok: true };
};

/* ---- History ------------------------------------------------------------ */

export interface TableEventView {
  id: number;
  type: string;
  actor: "comensal" | "personal" | "sistema" | "mercado_pago";
  at: string;
  who: string | null;
  amount: number | null;
  method: string | null;
}

/* Who did what on a table, newest first (mesa_historial in split-payments.sql
 * resolves names from the employee record or the account). */
export const fetchTableHistory = async (
  sessionId: string,
): Promise<DataResult<TableEventView[]>> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return ok([]);
  const { data, error } = await supabase.rpc("mesa_historial", { p_sesion: sessionId });
  if (error) {
    reportError("panel.mesas.historial", error, { sessionId });
    return fail(desdeSupabase(error));
  }
  return ok(
    ((data as Record<string, unknown>[] | null) ?? []).map((e) => ({
      id: Number(e.id),
      type: String(e.tipo),
      actor: e.actor as TableEventView["actor"],
      at: String(e.creado_en),
      who: (e.quien as string | null) ?? null,
      amount: e.monto == null ? null : Number(e.monto),
      method: (e.metodo as string | null) ?? null,
    })),
  );
};
