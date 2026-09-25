"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import { ok, fail, desdeSupabase, type DataResult } from "@/lib/data/result";
import { reportError } from "@/lib/observability";
import { counterChargeMethodSchema } from "@/lib/schemas";
import { mapPickupOrders, type PickupOrder } from "@/lib/tablePickup";
import { updateOrderStatus, type OrderStatusResult } from "@/lib/data/orders";

/* La caja de Pedidos en modalidad Mesa.
 *
 * Lee y cobra por RPC (supabase/pedidos-mesa.sql): las funciones vuelven a
 * chequear sucursal, modalidad y suscripción, y cobrar es lo único que hace
 * entrar a preparación un pedido que el cliente eligió pagar en caja. */

export type CounterChargeMethod = (typeof counterChargeMethodSchema.options)[number];

export const fetchOrdersToCharge = async (
  branchId: string,
): Promise<DataResult<PickupOrder[]>> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return ok([]);
  const { data, error } = await supabase.rpc("pedidos_por_cobrar", { p_local: branchId });
  if (error) {
    reportError("panel.pedidos.por-cobrar", error, { branchId });
    return fail(desdeSupabase(error));
  }
  return ok(mapPickupOrders(data));
};

export type ChargeResult =
  | { ok: true; repeated: boolean }
  | { ok: false; reason: string };

export const chargePickupOrder = async (
  orderId: string,
  method: CounterChargeMethod,
  employeeId: string | null,
): Promise<ChargeResult> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return { ok: false, reason: "not-configured" };
  const m = counterChargeMethodSchema.safeParse(method);
  if (!m.success) return { ok: false, reason: "datos-invalidos" };
  const { data, error } = await supabase.rpc("cobrar_pedido_autoservicio", {
    p_pedido: orderId,
    p_metodo: m.data,
    p_empleado: employeeId,
  });
  if (error) {
    reportError("panel.pedidos.cobrar", error, { orderId });
    return { ok: false, reason: error.code === "42501" ? "permiso" : "error" };
  }
  const r = (data ?? {}) as { ok?: boolean; reason?: string; repetido?: boolean };
  if (r.ok === false) return { ok: false, reason: String(r.reason ?? "error") };
  return { ok: true, repeated: Boolean(r.repetido) };
};

/* Un pedido que nadie va a pagar (el cliente se fue). Mismo update con
 * compare-and-swap que el resto del tablero; el trigger suelta su checkout. */
export const cancelUnpaidOrder = (orderId: string): Promise<OrderStatusResult> =>
  updateOrderStatus(orderId, "cancelado");
