import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  mapBill,
  mapPaymentSettings,
  type PaymentSettings,
  type TableBill,
} from "@/lib/tableBill";
import { mercadoPagoConfigured } from "@/lib/server/mercadopago";
import { orderForGuests } from "@/lib/menuView";
import { brandFromLocal, emptyCustomerBrand, type CustomerBrand } from "@/lib/customerBrand";
import { GUEST_COOKIE } from "@/lib/guestSession";

/* Guest identity at a table.
 *
 * Joining creates a `comensales` row (the real guest id) and a random 256-bit
 * secret. The browser keeps `<guestId>.<secret>` in an httpOnly cookie; the
 * database only has sha256(secret). Every guest call sends id + hash and the
 * SQL function checks them, so a guest can't act as another one even knowing
 * their id. The name is display only.
 *
 * Set-Cookie must go on the JSON response (cookies().set() in a Route Handler
 * is easy to drop). Camera browsers may still discard it; the client keeps a
 * copy in localStorage and POST /restaurar puts the cookie back. */

export { GUEST_COOKIE };
const COOKIE_MAX_AGE = 12 * 60 * 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_RE = /^[A-Za-z0-9_-]{43}$/;

export const hashSecret = (secret: string): string =>
  crypto.createHash("sha256").update(secret).digest("hex");

export const newGuestSecret = (): { secret: string; hash: string } => {
  const secret = crypto.randomBytes(32).toString("base64url");
  return { secret, hash: hashSecret(secret) };
};

export type GuestCredentials = { guestId: string; tokenHash: string };
export type GuestCookieValue = GuestCredentials & { secret: string };

export const parseGuestCookieValue = (raw: string): GuestCookieValue | null => {
  const [guestId, secret] = raw.split(".");
  if (!guestId || !secret || !UUID_RE.test(guestId) || !SECRET_RE.test(secret)) {
    return null;
  }
  return { guestId, secret, tokenHash: hashSecret(secret) };
};

export const readGuestCookie = async (): Promise<GuestCredentials | null> => {
  const parsed = parseGuestCookieValue((await cookies()).get(GUEST_COOKIE)?.value ?? "");
  if (!parsed) return null;
  return { guestId: parsed.guestId, tokenHash: parsed.tokenHash };
};

export const attachGuestCookie = <T extends NextResponse>(
  res: T,
  guestId: string,
  secret: string,
): T => {
  res.cookies.set(GUEST_COOKIE, `${guestId}.${secret}`, guestCookieOptions());
  return res;
};

export const guestCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: COOKIE_MAX_AGE,
});

/* Mutating guest endpoints rely on a cookie, so they refuse cross-site
 * requests. SameSite=Lax already blocks cross-site fetch POSTs; this is the
 * second lock. */
export const sameOrigin = (req: Request): boolean => {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
};

/* ---- Reads -------------------------------------------------------------- */

export type TableQr =
  | {
      ok: true;
      tableId: string;
      tableNumber: number;
      branchId: string;
      branchName: string;
      operational: boolean;
    }
  | { ok: false; reason: "not-found" | "not-available" | "not-configured" };

export const resolveTableQr = async (token: string): Promise<TableQr> => {
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, reason: "not-configured" };
  const { data, error } = await admin.rpc("mesa_por_qr", { p_token: token });
  if (error || !data) return { ok: false, reason: "not-found" };
  const r = data as Record<string, unknown>;
  if (!r.ok) {
    return { ok: false, reason: r.reason === "not-available" ? "not-available" : "not-found" };
  }
  return {
    ok: true,
    tableId: String(r.mesa_id),
    tableNumber: Number(r.mesa_numero),
    branchId: String(r.local_id),
    branchName: String(r.local_nombre ?? ""),
    operational: Boolean(r.operativo),
  };
};

export const fetchBranchName = async (branchId: string): Promise<string> =>
  (await fetchBranchBrand(branchId)).name;

export const fetchBranchBrand = async (
  branchId: string,
): Promise<CustomerBrand> => {
  const admin = createAdminSupabase();
  if (!admin) return emptyCustomerBrand();
  const { data } = await admin
    .from("locales")
    .select("nombre, logo_url, color_marca")
    .eq("id", branchId)
    .maybeSingle();
  return brandFromLocal(data);
};

export interface MenuProduct {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  imageUrl: string | null;
}

export const fetchMenu = async (branchId: string): Promise<MenuProduct[]> => {
  const admin = createAdminSupabase();
  if (!admin) return [];
  const [{ data, error }, cats] = await Promise.all([
    admin
      .from("productos")
      .select("id, nombre, descripcion, categoria, precio, imagen_url, orden")
      .eq("local_id", branchId)
      .eq("activo", true)
      .order("orden", { ascending: true })
      .order("nombre", { ascending: true }),
    admin
      .from("categorias")
      .select("nombre, activa, orden")
      .eq("local_id", branchId),
  ]);
  if (error) {
    console.error("m.menu", error.message);
    return [];
  }
  const products = (data ?? []).map((p) => ({
    id: p.id as string,
    name: p.nombre as string,
    description: (p.descripcion as string | null) ?? null,
    category: (p.categoria as string | null) ?? null,
    price: p.precio as number,
    imageUrl: (p.imagen_url as string | null) ?? null,
    order: (p.orden as number | null) ?? 0,
  }));
  const categories = (cats.data ?? []).map((c) => ({
    name: String(c.nombre ?? ""),
    active: c.activa !== false,
    order: Number(c.orden ?? 0),
  }));
  /* Same rules as the owner's "Ver menú" preview (lib/menuView). */
  return orderForGuests(categories, products).map(({ order: _order, ...p }) => p);
};

export interface GuestPaymentOptions {
  settings: PaymentSettings;
  mercadoPagoReady: boolean;
}

export const fetchGuestPaymentOptions = async (
  branchId: string,
): Promise<GuestPaymentOptions> => {
  const admin = createAdminSupabase();
  if (!admin) {
    return { settings: mapPaymentSettings(null), mercadoPagoReady: false };
  }
  const [{ data: cobros }, { count }] = await Promise.all([
    admin
      .from("local_cobros")
      .select(
        "acepta_mercado_pago, acepta_transferencia, acepta_efectivo, acepta_debito, acepta_credito, transferencia_alias, transferencia_titular, transferencia_cbu, recargo_debito_pct, recargo_credito_pct, recargo_declarado",
      )
      .eq("local_id", branchId)
      .maybeSingle(),
    admin
      .from("mp_cuentas")
      .select("local_id", { count: "exact", head: true })
      .eq("local_id", branchId),
  ]);
  return {
    settings: mapPaymentSettings(cobros as Record<string, unknown> | null),
    mercadoPagoReady: mercadoPagoConfigured() && (count ?? 0) > 0,
  };
};

export type GuestState =
  | {
      ok: true;
      guest: { id: string; name: string; sessionId: string };
      tableToken: string | null;
      bill: TableBill;
    }
  | { ok: false; reason: "no-guest" | "not-configured" };

export const fetchGuestState = async (
  creds: GuestCredentials | null,
): Promise<GuestState> => {
  if (!creds) return { ok: false, reason: "no-guest" };
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, reason: "not-configured" };
  const { data, error } = await admin.rpc("cuenta_comensal", {
    p_comensal: creds.guestId,
    p_token_hash: creds.tokenHash,
  });
  if (error || !data) {
    if (error) console.error("m.cuenta", error.message);
    return { ok: false, reason: "no-guest" };
  }
  const r = data as Record<string, unknown>;
  const bill = mapBill(r.cuenta);
  if (!r.ok || !bill) return { ok: false, reason: "no-guest" };
  const c = r.comensal as Record<string, unknown>;
  return {
    ok: true,
    guest: { id: String(c.id), name: String(c.nombre), sessionId: String(c.sesion_id) },
    tableToken: (r.mesa_token as string | null) ?? null,
    bill,
  };
};

/* ---- Writes (thin wrappers; the rules live in SQL) ------------------------ */

type RpcResult = Record<string, unknown> & { ok: boolean; reason?: string };

const callRpc = async (
  fn: string,
  args: Record<string, unknown>,
): Promise<RpcResult> => {
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, reason: "not-configured" };
  const { data, error } = await admin.rpc(fn, args);
  if (error) {
    console.error(`m.${fn}`, error.message);
    return { ok: false, reason: "db-error" };
  }
  return (data as RpcResult) ?? { ok: false, reason: "db-error" };
};

export const joinTable = (token: string, name: string, tokenHash: string) =>
  callRpc("unirse_mesa", { p_token: token, p_nombre: name, p_token_hash: tokenHash });

export const placeGuestOrder = (
  creds: GuestCredentials,
  items: { productId: string; quantity: number }[],
  key: string,
) =>
  callRpc("pedir_como_comensal", {
    p_comensal: creds.guestId,
    p_token_hash: creds.tokenHash,
    p_items: items.map((i) => ({ producto_id: i.productId, cantidad: i.quantity })),
    p_clave: key,
  });

export const createGuestPayment = (creds: GuestCredentials, datos: Record<string, unknown>) =>
  callRpc("pagar_como_comensal", {
    p_comensal: creds.guestId,
    p_token_hash: creds.tokenHash,
    p_datos: datos,
  });

export const cancelGuestPayment = (creds: GuestCredentials, paymentId: string) =>
  callRpc("cancelar_pago_comensal", {
    p_comensal: creds.guestId,
    p_token_hash: creds.tokenHash,
    p_pago: paymentId,
  });

export const cancelGuestOrder = (creds: GuestCredentials, orderId: string) =>
  callRpc("cancelar_pedido_comensal", {
    p_comensal: creds.guestId,
    p_token_hash: creds.tokenHash,
    p_pedido: orderId,
  });

export const callWaiter = (creds: GuestCredentials) =>
  callRpc("llamar_mozo_comensal", {
    p_comensal: creds.guestId,
    p_token_hash: creds.tokenHash,
  });

export const attachPreference = async (paymentId: string, preferenceId: string) => {
  const admin = createAdminSupabase();
  if (!admin) return;
  const { error } = await admin.rpc("mp_asociar_preferencia", {
    p_pago: paymentId,
    p_preferencia: preferenceId,
  });
  if (error) console.error("m.mp_asociar_preferencia", error.message);
};

export const cancelMercadoPagoPayment = async (paymentId: string, reason: string) => {
  const admin = createAdminSupabase();
  if (!admin) return;
  const { error } = await admin.rpc("mp_cancelar_pago", {
    p_pago: paymentId,
    p_motivo: reason,
  });
  if (error) console.error("m.mp_cancelar_pago", error.message);
};

export const confirmMercadoPagoPayment = (args: {
  branchId: string;
  paymentId: string;
  mpPaymentId: string;
  status: string;
  amount: number;
  currency: string;
}) =>
  callRpc("mp_confirmar_pago", {
    p_local: args.branchId,
    p_pago: args.paymentId,
    p_mp_pago_id: args.mpPaymentId,
    p_mp_estado: args.status,
    p_monto: args.amount,
    p_moneda: args.currency,
  });
