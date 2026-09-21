import crypto from "node:crypto";

/* Mercado Pago webhook signature (x-signature header).
 *
 * The header looks like `ts=1704908010,v1=<hex>`. MP signs this manifest with
 * the application's webhook secret using HMAC-SHA256:
 *
 *   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 *
 * `data.id` comes from the query string and goes lowercase when it's
 * alphanumeric. A part whose value didn't arrive is left out of the manifest.
 *
 * Kept apart from the route (and free of server-only) so it can be tested. */

export const parseSignatureHeader = (
  header: string | null,
): { ts: string; v1: string } | null => {
  if (!header) return null;
  let ts = "";
  let v1 = "";
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2).map((x) => x?.trim() ?? "");
    if (k === "ts") ts = v ?? "";
    if (k === "v1") v1 = v ?? "";
  }
  return ts && /^[0-9a-f]{64}$/i.test(v1) ? { ts, v1: v1.toLowerCase() } : null;
};

export const signatureManifest = (args: {
  dataId: string | null;
  requestId: string | null;
  ts: string;
}): string => {
  const id = args.dataId
    ? /^[a-z0-9]+$/i.test(args.dataId)
      ? args.dataId.toLowerCase()
      : args.dataId
    : null;
  return (
    (id ? `id:${id};` : "") +
    (args.requestId ? `request-id:${args.requestId};` : "") +
    `ts:${args.ts};`
  );
};

/* MP reintenta notificaciones durante horas. 48 h cubre esos reintentos
 * y corta un replay viejo. 5 min hacia adelante absorbe desfase de reloj. */
export const MAX_MP_SIGNATURE_AGE_SEC = 48 * 60 * 60;
export const MAX_MP_SIGNATURE_FUTURE_SEC = 5 * 60;

export const mercadoPagoTimestampFresh = (
  ts: string,
  nowSec = Math.floor(Date.now() / 1000),
): boolean => {
  if (!/^\d{1,12}$/.test(ts)) return false;
  const t = Number(ts);
  if (!Number.isFinite(t) || t <= 0) return false;
  if (t > nowSec + MAX_MP_SIGNATURE_FUTURE_SEC) return false;
  if (nowSec - t > MAX_MP_SIGNATURE_AGE_SEC) return false;
  return true;
};

export const verifyMercadoPagoSignature = (args: {
  header: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
  nowSec?: number;
}): boolean => {
  const parsed = parseSignatureHeader(args.header);
  if (!parsed || !args.secret) return false;
  if (!mercadoPagoTimestampFresh(parsed.ts, args.nowSec)) return false;
  const expected = crypto
    .createHmac("sha256", args.secret)
    .update(
      signatureManifest({
        dataId: args.dataId,
        requestId: args.requestId,
        ts: parsed.ts,
      }),
    )
    .digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(parsed.v1, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
