import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { mapPickupState, type PickupPayChoice, type PickupState } from "@/lib/tablePickup";
import {
  callRpc,
  startGuestMercadoPagoCheckout,
  type GuestCredentials,
} from "@/lib/server/tableGuest";

/* Pedidos en modalidad Mesa, del lado del servidor.
 *
 * Mismo esquema que la cuenta de la mesa (tableGuest.ts): el teléfono tiene
 * la cookie del comensal, acá se la pasa con su hash a las funciones de
 * supabase/pedidos-mesa.sql, que son las que deciden. Esto es un envoltorio
 * fino. */

export const fetchPickupState = async (
  token: string,
  creds: GuestCredentials | null,
): Promise<{ ok: true; state: PickupState } | { ok: false; reason: string }> => {
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, reason: "not-configured" };
  const { data, error } = await admin.rpc("mesa_autoservicio_estado", {
    p_token: token,
    p_comensal: creds?.guestId ?? null,
    p_token_hash: creds?.tokenHash ?? null,
  });
  if (error || !data) {
    if (error) console.error("m.autoservicio.estado", error.message);
    return { ok: false, reason: "db-error" };
  }
  const r = data as Record<string, unknown>;
  if (r.ok === false) return { ok: false, reason: String(r.reason ?? "not-found") };
  const state = mapPickupState(r);
  return state ? { ok: true, state } : { ok: false, reason: "db-error" };
};

export const joinPickupTable = (token: string, name: string, tokenHash: string) =>
  callRpc("unirse_mesa_autoservicio", {
    p_token: token,
    p_nombre: name,
    p_token_hash: tokenHash,
  });

export const placePickupOrder = (
  creds: GuestCredentials,
  items: { productId: string; quantity: number }[],
  key: string,
  method: PickupPayChoice,
) =>
  callRpc("pedir_autoservicio", {
    p_comensal: creds.guestId,
    p_token_hash: creds.tokenHash,
    p_items: items.map((i) => ({ producto_id: i.productId, cantidad: i.quantity })),
    p_clave: key,
    p_metodo: method,
  });

export const changePickupPayment = (
  creds: GuestCredentials,
  orderId: string,
  method: PickupPayChoice,
) =>
  callRpc("pagar_pedido_autoservicio", {
    p_comensal: creds.guestId,
    p_token_hash: creds.tokenHash,
    p_pedido: orderId,
    p_metodo: method,
  });

export const cancelPickupOrder = (creds: GuestCredentials, orderId: string) =>
  callRpc("cancelar_pedido_autoservicio", {
    p_comensal: creds.guestId,
    p_token_hash: creds.tokenHash,
    p_pedido: orderId,
  });

/* El checkout de un pedido: la misma preference y el mismo webhook que la
 * cuenta de la mesa. El título dice qué pedido es, para que el cliente lo
 * reconozca en Mercado Pago y en su resumen. */
export const startPickupCheckout = (
  token: string,
  paymentId: string,
  opts: { branchName: string; reference: string; tableNumber: number },
) =>
  startGuestMercadoPagoCheckout(token, paymentId, {
    title: `${opts.branchName || "Pedido"} · Pedido ${opts.reference} · Mesa ${opts.tableNumber}`,
  });
