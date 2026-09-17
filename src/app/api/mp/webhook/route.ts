import { NextResponse } from "next/server";
import { sharedRateLimit } from "@/lib/security/rateLimitShared";
import { clientIp } from "@/lib/security/ip";
import { uuid } from "@/lib/schemas";
import { verifyMercadoPagoSignature } from "@/lib/mpSignature";
import {
  fetchPayment,
  mercadoPagoConfigured,
  webhookSecret,
} from "@/lib/server/mercadopago";
import { confirmMercadoPagoPayment } from "@/lib/server/tableGuest";

export const dynamic = "force-dynamic";

const reply = (status: number, body: Record<string, unknown> = {}) =>
  NextResponse.json(body, { status });

/* Mercado Pago payment notifications.
 *
 * Nothing in the request is trusted as a payment state:
 *   1. The x-signature HMAC must match (MP_WEBHOOK_SECRET).
 *   2. The payment is fetched from MP's API with the branch's own token.
 *   3. mp_confirmar_pago checks again that external_reference is one of our
 *      payments, for this branch, with the exact amount and currency.
 *
 * Answers 200 for anything we handled or deliberately ignore, and 5xx only
 * when a retry could help (MP down, token refresh failed). */
export const POST = async (req: Request) => {
  /* Not configured yet: no checkout can exist, so there's nothing to confirm.
   * Answer 200 so MP accepts the URL while the application is being set up. */
  if (!mercadoPagoConfigured()) return reply(200, { ok: true, ignored: true });

  const limit = await sharedRateLimit(`mp-webhook:ip:${clientIp(req)}`, 600, 60_000);
  if (!limit.ok) return reply(429, { ok: false });

  const url = new URL(req.url);
  const body = (await req.json().catch(() => null)) as {
    type?: string;
    action?: string;
    data?: { id?: string | number };
  } | null;

  const queryId = url.searchParams.get("data.id");
  const bodyId = body?.data?.id != null ? String(body.data.id) : null;
  const dataId = queryId ?? bodyId;
  const type = url.searchParams.get("type") ?? body?.type ?? url.searchParams.get("topic");

  /* MP signs with data.id from the query string; when the URL doesn't carry
   * it (e.g. the panel's "Simular notificación"), the body's id is what gets
   * signed. Either way the id stays bound to the signature. */
  const header = req.headers.get("x-signature");
  const requestId = req.headers.get("x-request-id");
  const secret = webhookSecret();
  const firmaOk = verifyMercadoPagoSignature({ header, requestId, dataId, secret });
  if (!firmaOk) return reply(401, { ok: false });

  if (type !== "payment" || !dataId) return reply(200, { ok: true, ignored: true });

  const localId = url.searchParams.get("local");
  if (!uuid.safeParse(localId).success) return reply(200, { ok: true, ignored: true });

  const pago = await fetchPayment(localId!, dataId);
  if (pago === null) return reply(502, { ok: false });
  if (pago === "not-found") return reply(200, { ok: true, ignored: true });
  if (!uuid.safeParse(pago.externalReference).success) {
    return reply(200, { ok: true, ignored: true });
  }

  const res = await confirmMercadoPagoPayment({
    branchId: localId!,
    paymentId: pago.externalReference!,
    mpPaymentId: pago.id,
    status: pago.status,
    amount: pago.amount,
    currency: pago.currency,
  });
  if (!res.ok && res.reason === "db-error") return reply(500, { ok: false });

  return reply(200, { ok: true });
};
