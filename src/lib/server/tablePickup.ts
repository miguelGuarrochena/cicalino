import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  mapPickupState,
  type PickupFlow,
  type PickupPayChoice,
  type PickupState,
} from "@/lib/tablePickup";
import {
  callRpc,
  resolveTableQr,
  startGuestMercadoPagoCheckout,
  type GuestCredentials,
} from "@/lib/server/tableGuest";

/* Pedidos hechos desde un QR (modalidades Mesa y Mostrador QR), del lado del
 * servidor.
 *
 * Mismo esquema que la cuenta de la mesa (tableGuest.ts): el teléfono tiene
 * la cookie del comensal, acá se la pasa con su hash a las funciones de
 * supabase/pedidos-mesa.sql y pedidos-mostrador-qr.sql, que son las que
 * deciden. Esto es un envoltorio fino. */

/* El QR del mostrador: uno por local, no identifica mesa ni pedido. */
export type CounterQr =
  | { ok: true; branchId: string; branchName: string; operational: boolean }
  | { ok: false; reason: "not-found" | "not-available" | "not-configured" };

export const resolveCounterQr = async (token: string): Promise<CounterQr> => {
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, reason: "not-configured" };
  const { data, error } = await admin.rpc("mostrador_qr_por_token", { p_token: token });
  if (error || !data) return { ok: false, reason: "not-found" };
  const r = data as Record<string, unknown>;
  if (!r.ok) {
    return { ok: false, reason: r.reason === "not-available" ? "not-available" : "not-found" };
  }
  return {
    ok: true,
    branchId: String(r.local_id),
    branchName: String(r.local_nombre ?? ""),
    operational: Boolean(r.operativo),
  };
};

/* A qué pedido-desde-QR lleva el token: el de una mesa (modalidad Mesa) o el
 * del mostrador. La cuenta compartida de Pagos no es de acá. */
export type PickupQr =
  | {
      ok: true;
      flow: PickupFlow;
      branchId: string;
      branchName: string;
      operational: boolean;
      tableNumber: number | null;
      /* Mostrador QR entrado con un QR regenerado: solo seguimiento de los
       * pedidos que ya tiene el teléfono, nada nuevo (resolvePickupAccess). */
      stale?: boolean;
    }
  | { ok: false; reason: "not-found" | "not-available" | "not-configured" };

export const resolvePickupQr = async (token: string): Promise<PickupQr> => {
  const mesa = await resolveTableQr(token);
  if (mesa.ok) {
    if (mesa.flow !== "autoservicio") return { ok: false, reason: "not-available" };
    return {
      ok: true,
      flow: "autoservicio",
      branchId: mesa.branchId,
      branchName: mesa.branchName,
      operational: mesa.operational,
      tableNumber: mesa.tableNumber,
    };
  }
  const counter = await resolveCounterQr(token);
  if (!counter.ok) return counter;
  return { ...counter, flow: "mostrador_qr", tableNumber: null };
};

const readState = async (
  fn: "mesa_autoservicio_estado" | "mostrador_qr_estado",
  token: string,
  creds: GuestCredentials | null,
): Promise<{ ok: true; state: PickupState } | { ok: false; reason: string }> => {
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, reason: "not-configured" };
  const { data, error } = await admin.rpc(fn, {
    p_token: token,
    p_comensal: creds?.guestId ?? null,
    p_token_hash: creds?.tokenHash ?? null,
  });
  if (error || !data) {
    if (error) console.error(`m.${fn}`, error.message);
    return { ok: false, reason: "db-error" };
  }
  const r = data as Record<string, unknown>;
  if (r.ok === false) return { ok: false, reason: String(r.reason ?? "not-found") };
  const state = mapPickupState(r);
  return state ? { ok: true, state } : { ok: false, reason: "db-error" };
};

/* Lo que ve la pantalla del QR. El token de una mesa se resuelve primero (es
 * el caso de la modalidad Mesa); si no es de una mesa, puede ser el del
 * mostrador. */
export const fetchPickupState = async (
  token: string,
  creds: GuestCredentials | null,
  flow?: PickupFlow,
): Promise<{ ok: true; state: PickupState } | { ok: false; reason: string }> => {
  if (flow === "mostrador_qr") return readState("mostrador_qr_estado", token, creds);
  const mesa = await readState("mesa_autoservicio_estado", token, creds);
  if (mesa.ok || flow === "autoservicio" || mesa.reason !== "not-found") return mesa;
  return readState("mostrador_qr_estado", token, creds);
};

/* Como resolvePickupQr, pero para lo que el teléfono hace con pedidos que ya
 * existen (verlos, pagarlos, recibir el aviso). Si el QR del mostrador se
 * regeneró, el token viejo sigue valiendo para quien ya pidió en ese local:
 * el pedido no depende de que el cartel siga vigente. Iniciar un pedido
 * nuevo usa resolvePickupQr, que no tiene esta salida. */
export const resolvePickupAccess = async (
  token: string,
  creds: GuestCredentials | null,
): Promise<PickupQr> => {
  const qr = await resolvePickupQr(token);
  if (qr.ok || qr.reason !== "not-found" || !creds) return qr;
  const res = await readState("mostrador_qr_estado", token, creds);
  if (!res.ok || !res.state.guest || !res.state.branch) return qr;
  return {
    ok: true,
    flow: "mostrador_qr",
    branchId: res.state.branch.id,
    branchName: res.state.branch.name,
    operational: res.state.operational,
    tableNumber: null,
    stale: true,
  };
};

export const joinPickupTable = (token: string, name: string, tokenHash: string) =>
  callRpc("unirse_mesa_autoservicio", {
    p_token: token,
    p_nombre: name,
    p_token_hash: tokenHash,
  });

/* En el mostrador la identidad no lleva nombre: se crea al ir a pedir. */
export const joinCounter = (token: string, tokenHash: string) =>
  callRpc("unirse_mostrador_qr", { p_token: token, p_token_hash: tokenHash });

type CartItems = { productId: string; quantity: number }[];

const rpcItems = (items: CartItems) =>
  items.map((i) => ({ producto_id: i.productId, cantidad: i.quantity }));

export const placePickupOrder = (
  creds: GuestCredentials,
  items: CartItems,
  key: string,
  method: PickupPayChoice,
) =>
  callRpc("pedir_autoservicio", {
    p_comensal: creds.guestId,
    p_token_hash: creds.tokenHash,
    p_items: rpcItems(items),
    p_clave: key,
    p_metodo: method,
  });

/* Solo con el QR vigente del local: la base lo vuelve a comprobar. */
export const placeCounterOrder = (
  token: string,
  creds: GuestCredentials,
  items: CartItems,
  key: string,
  method: PickupPayChoice,
  name: string | null,
) =>
  callRpc("pedir_mostrador_qr", {
    p_token: token,
    p_comensal: creds.guestId,
    p_token_hash: creds.tokenHash,
    p_items: rpcItems(items),
    p_clave: key,
    p_metodo: method,
    p_nombre: name,
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
  opts: { branchName: string; reference: string; tableNumber: number | null },
) =>
  startGuestMercadoPagoCheckout(token, paymentId, {
    title: [
      opts.branchName || "Pedido",
      `Pedido ${opts.reference}`,
      opts.tableNumber ? `Mesa ${opts.tableNumber}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  });
