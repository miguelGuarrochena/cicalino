import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { IdentificationMode } from "@/lib/store/config-store";
import type { OrderStatus } from "@/lib/types";

/* Lectura del pedido desde el lado del cliente final (pantalla /p/[token]).
 *
 * Hay dos formas de leerlo a propósito:
 *
 *  - `fetchCustomerOrderFull`: la carga inicial. Trae el nombre del local y el
 *    modo de identificación, que salen de un join a `locales`. Se ejecuta una
 *    sola vez por visita, durante el render en el servidor.
 *
 *  - `fetchCustomerOrderStatus`: el poll. Solo lee columnas de `pedidos`, sin
 *    join, porque el nombre del local no cambia mientras el cliente espera.
 *    Este es el query que se repite decenas de veces por pedido, así que es el
 *    único que importa optimizar.
 */

export interface CustomerOrderSnapshot {
  reference: string;
  alias: string | null;
  status: OrderStatus;
  branchName: string;
  modo: IdentificationMode;
  notifiedAt: string | null;
}

export interface CustomerOrderStatus {
  reference: string;
  alias: string | null;
  status: OrderStatus;
  notifiedAt: string | null;
}

export type NotFoundReason = "not-found" | "expired" | "not-configured";

export type FullResult =
  | { ok: true; id: string; seen: boolean; order: CustomerOrderSnapshot }
  | { ok: false; reason: NotFoundReason };

export type StatusResult =
  | { ok: true; id: string; seen: boolean; order: CustomerOrderStatus }
  | { ok: false; reason: NotFoundReason };

const expirado = (qrExpiraEn: string | null): boolean =>
  Boolean(qrExpiraEn && new Date(qrExpiraEn) < new Date());

export const fetchCustomerOrderFull = async (
  token: string,
): Promise<FullResult> => {
  const supabase = createAdminSupabase();
  if (!supabase) return { ok: false, reason: "not-configured" };

  const { data, error } = await supabase
    .from("pedidos")
    .select(
      "id, referencia, alias_cliente, estado, qr_expira_en, visto_en, avisado_en, locales(nombre, modo_identificacion)",
    )
    .eq("qr_token", token)
    .single();

  if (error || !data) return { ok: false, reason: "not-found" };
  if (expirado(data.qr_expira_en)) return { ok: false, reason: "expired" };

  const local = Array.isArray(data.locales) ? data.locales[0] : data.locales;

  return {
    ok: true,
    id: data.id,
    seen: Boolean(data.visto_en),
    order: {
      reference: data.referencia,
      alias: (data.alias_cliente as string | null) ?? null,
      status: data.estado as OrderStatus,
      branchName: local?.nombre ?? "",
      modo: (local?.modo_identificacion ?? "pedido") as IdentificationMode,
      notifiedAt: data.avisado_en ?? null,
    },
  };
};

export const fetchCustomerOrderStatus = async (
  token: string,
): Promise<StatusResult> => {
  const supabase = createAdminSupabase();
  if (!supabase) return { ok: false, reason: "not-configured" };

  const { data, error } = await supabase
    .from("pedidos")
    .select("id, referencia, alias_cliente, estado, qr_expira_en, visto_en, avisado_en")
    .eq("qr_token", token)
    .single();

  if (error || !data) return { ok: false, reason: "not-found" };
  if (expirado(data.qr_expira_en)) return { ok: false, reason: "expired" };

  return {
    ok: true,
    id: data.id,
    seen: Boolean(data.visto_en),
    order: {
      reference: data.referencia,
      alias: (data.alias_cliente as string | null) ?? null,
      status: data.estado as OrderStatus,
      notifiedAt: data.avisado_en ?? null,
    },
  };
};

/* Marca que el cliente abrió el QR. Solo escribe la primera vez: sin esta
 * guarda, cada poll haría un UPDATE y el panel recibiría un evento de realtime
 * por segundo y por pedido. */
export const markCustomerOrderSeen = async (id: string): Promise<void> => {
  const supabase = createAdminSupabase();
  if (!supabase) return;
  await supabase
    .from("pedidos")
    .update({ visto_en: new Date().toISOString() })
    .eq("id", id)
    .is("visto_en", null);
};

export const updateCustomerOrderAlias = async (
  token: string,
  alias: string | null,
): Promise<
  | { ok: true; alias: string | null }
  | {
      ok: false;
      reason: "not-found" | "expired" | "closed" | "not-configured" | "db-error";
    }
> => {
  const supabase = createAdminSupabase();
  if (!supabase) return { ok: false, reason: "not-configured" };

  const { data, error } = await supabase
    .from("pedidos")
    .select("id, estado, qr_expira_en")
    .eq("qr_token", token)
    .maybeSingle();

  if (error || !data) return { ok: false, reason: "not-found" };
  if (expirado(data.qr_expira_en)) return { ok: false, reason: "expired" };
  if (data.estado === "retirado" || data.estado === "cancelado") {
    return { ok: false, reason: "closed" };
  }

  const { data: updated, error: updErr } = await supabase
    .from("pedidos")
    .update({ alias_cliente: alias })
    .eq("id", data.id)
    .in("estado", ["creado", "en_preparacion", "listo"])
    .select("alias_cliente");

  if (updErr) {
    console.error("p/alias", updErr.message);
    return { ok: false, reason: "db-error" };
  }
  if (!updated?.length) return { ok: false, reason: "closed" };

  return {
    ok: true,
    alias: (updated[0]?.alias_cliente as string | null) ?? null,
  };
};
