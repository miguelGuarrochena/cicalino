import "server-only";
import crypto from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { appBaseUrl } from "@/lib/appUrl";
import { open, seal, secretBoxConfigured } from "@/lib/server/secretBox";

/* Mercado Pago, OAuth flavour: Cicalino has one MP application; each
 * restaurant authorizes it on their own MP account, and checkouts are created
 * with that restaurant's token so the money lands in their account.
 *
 * Environment:
 *   MP_CLIENT_ID / MP_CLIENT_SECRET  the Cicalino application
 *   MP_WEBHOOK_SECRET                "Webhooks → secret" of that application
 *   MP_TOKENS_KEY                    32 random bytes, base64 (secretBox)
 *
 * Without all four, Mercado Pago simply isn't offered anywhere. */

const API = "https://api.mercadopago.com";
const AUTH = "https://auth.mercadopago.com/authorization";

export const mercadoPagoConfigured = (): boolean =>
  Boolean(
    process.env.MP_CLIENT_ID?.trim() &&
      process.env.MP_CLIENT_SECRET?.trim() &&
      process.env.MP_WEBHOOK_SECRET?.trim() &&
      secretBoxConfigured(),
  );

export const webhookSecret = (): string => process.env.MP_WEBHOOK_SECRET?.trim() ?? "";

const redirectUri = (): string => `${appBaseUrl()}/api/mp/oauth/callback`;

const sha256 = (s: string): string =>
  crypto.createHash("sha256").update(s).digest("hex");

/* ---- OAuth ------------------------------------------------------------- */

export const startOAuth = async (
  localId: string,
  usuarioId: string,
): Promise<string | null> => {
  const admin = createAdminSupabase();
  if (!admin || !mercadoPagoConfigured()) return null;

  const state = crypto.randomBytes(24).toString("base64url");
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

  await admin.from("mp_oauth_estados").delete().lt("expira_en", new Date().toISOString());
  const { error } = await admin.from("mp_oauth_estados").insert({
    state_hash: sha256(state),
    local_id: localId,
    usuario_id: usuarioId,
    code_verifier: verifier,
  });
  if (error) {
    console.error("mp.oauth.start", error.message);
    return null;
  }

  const url = new URL(AUTH);
  url.searchParams.set("client_id", process.env.MP_CLIENT_ID!.trim());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user_id?: number | string;
  live_mode?: boolean;
};

const postToken = async (body: Record<string, string>): Promise<TokenResponse | null> => {
  try {
    const res = await fetch(`${API}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        client_id: process.env.MP_CLIENT_ID!.trim(),
        client_secret: process.env.MP_CLIENT_SECRET!.trim(),
        ...body,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error("mp.oauth.token", res.status);
      return null;
    }
    return (await res.json()) as TokenResponse;
  } catch (e) {
    console.error("mp.oauth.token", e);
    return null;
  }
};

const saveTokens = async (
  localId: string,
  t: TokenResponse,
  conectadoPor: string | null,
): Promise<boolean> => {
  const admin = createAdminSupabase();
  if (!admin || !t.access_token || !t.refresh_token || t.user_id == null) return false;
  const expira = new Date(Date.now() + Math.max(60, t.expires_in ?? 0) * 1000);
  const row: Record<string, unknown> = {
    local_id: localId,
    mp_user_id: String(t.user_id),
    access_token_cifrado: seal(t.access_token),
    refresh_token_cifrado: seal(t.refresh_token),
    expira_en: expira.toISOString(),
    live_mode: t.live_mode ?? null,
    actualizado_en: new Date().toISOString(),
  };
  if (conectadoPor) {
    row.conectado_por = conectadoPor;
    row.conectado_en = new Date().toISOString();
  }
  const { error } = await admin.from("mp_cuentas").upsert(row, { onConflict: "local_id" });
  if (error) console.error("mp.oauth.save", error.message);
  return !error;
};

export type OAuthCallbackResult =
  | { ok: true; localId: string }
  | { ok: false; reason: "state" | "user" | "exchange" | "config" };

/* The state is single use: it's deleted before exchanging the code, so a
 * replayed callback URL does nothing. It's also bound to the user who started
 * the flow. */
export const finishOAuth = async (args: {
  code: string;
  state: string;
  usuarioId: string;
}): Promise<OAuthCallbackResult> => {
  const admin = createAdminSupabase();
  if (!admin || !mercadoPagoConfigured()) return { ok: false, reason: "config" };

  const { data, error } = await admin
    .from("mp_oauth_estados")
    .delete()
    .eq("state_hash", sha256(args.state))
    .gt("expira_en", new Date().toISOString())
    .select("local_id, usuario_id, code_verifier")
    .maybeSingle();
  if (error || !data) return { ok: false, reason: "state" };
  if (data.usuario_id !== args.usuarioId) return { ok: false, reason: "user" };

  const tokens = await postToken({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: redirectUri(),
    code_verifier: data.code_verifier as string,
  });
  if (!tokens || !(await saveTokens(data.local_id as string, tokens, args.usuarioId))) {
    return { ok: false, reason: "exchange" };
  }
  return { ok: true, localId: data.local_id as string };
};

/* Seller token for a branch, refreshed when it's close to expiring. MP
 * rotates the refresh token on every renewal, so both are stored again. */
export const sellerAccessToken = async (localId: string): Promise<string | null> => {
  const admin = createAdminSupabase();
  if (!admin || !mercadoPagoConfigured()) return null;
  const { data } = await admin
    .from("mp_cuentas")
    .select("access_token_cifrado, refresh_token_cifrado, expira_en")
    .eq("local_id", localId)
    .maybeSingle();
  if (!data) return null;

  const venceEn = new Date(data.expira_en as string).getTime() - Date.now();
  if (venceEn > 7 * 24 * 60 * 60 * 1000) {
    return open(data.access_token_cifrado as string);
  }

  const refreshed = await postToken({
    grant_type: "refresh_token",
    refresh_token: open(data.refresh_token_cifrado as string),
  });
  if (refreshed && (await saveTokens(localId, refreshed, null))) {
    return refreshed.access_token ?? null;
  }
  /* Renewal failed but the old token may still be valid for a few days. */
  return venceEn > 0 ? open(data.access_token_cifrado as string) : null;
};

/* ---- Checkout ---------------------------------------------------------- */

export const createPreference = async (args: {
  localId: string;
  pagoId: string;
  title: string;
  amount: number;
  expiresAt: string;
  returnUrl: string;
}): Promise<{ id: string; initPoint: string } | null> => {
  const token = await sellerAccessToken(args.localId);
  if (!token) return null;
  const base = appBaseUrl();
  try {
    const res = await fetch(`${API}/checkout/preferences`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-idempotency-key": args.pagoId,
      },
      body: JSON.stringify({
        items: [
          {
            id: args.pagoId,
            title: args.title,
            quantity: 1,
            currency_id: "ARS",
            unit_price: args.amount,
          },
        ],
        external_reference: args.pagoId,
        notification_url: `${base}/api/mp/webhook?local=${encodeURIComponent(args.localId)}`,
        back_urls: {
          success: args.returnUrl,
          pending: args.returnUrl,
          failure: args.returnUrl,
        },
        auto_return: "approved",
        /* Approved or rejected right away: a restaurant can't wait for a
         * cash voucher to be paid at a store two days later. */
        binary_mode: true,
        payment_methods: {
          excluded_payment_types: [{ id: "ticket" }, { id: "atm" }],
        },
        expires: true,
        expiration_date_to: args.expiresAt,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error("mp.preference", res.status);
      return null;
    }
    const json = (await res.json()) as { id?: string; init_point?: string };
    return json.id && json.init_point ? { id: json.id, initPoint: json.init_point } : null;
  } catch (e) {
    console.error("mp.preference", e);
    return null;
  }
};

export type MpPayment = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  externalReference: string | null;
};

/* The only source we trust for the payment state: MP's API, queried with the
 * seller's token. The webhook body is just a hint of what to look up. */
export const fetchPayment = async (
  localId: string,
  paymentId: string,
): Promise<MpPayment | "not-found" | null> => {
  const token = await sellerAccessToken(localId);
  if (!token) return null;
  try {
    const res = await fetch(`${API}/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return "not-found";
    if (!res.ok) {
      console.error("mp.payment", res.status);
      return null;
    }
    const p = (await res.json()) as {
      id?: number | string;
      status?: string;
      transaction_amount?: number;
      currency_id?: string;
      external_reference?: string | null;
    };
    return {
      id: String(p.id ?? paymentId),
      status: p.status ?? "",
      amount: Number(p.transaction_amount ?? 0),
      currency: p.currency_id ?? "",
      externalReference: p.external_reference ?? null,
    };
  } catch (e) {
    console.error("mp.payment", e);
    return null;
  }
};
