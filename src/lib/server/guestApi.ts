import "server-only";
import { NextResponse } from "next/server";
import { sharedRateLimit } from "@/lib/security/rateLimitShared";
import { clientIp } from "@/lib/security/ip";
import { qrTokenSchema } from "@/lib/schemas";
import { sameOrigin } from "@/lib/server/tableGuest";

/* Shared front door for /api/m/[token]/*. Same shape as /api/p: validate the
 * token, rate limit per token and per IP, then let the route do its thing. */

export const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

const REASON_STATUS: Record<string, number> = {
  "not-found": 404,
  "not-available": 404,
  "no-guest": 401,
  "comensal-invalido": 401,
  "otra-mesa": 409,
  "mesa-cerrada": 409,
  "modo-bloqueado": 409,
  "monto-cambio": 409,
  "nada-que-pagar": 409,
  excede: 409,
  "no-pendiente": 409,
  "suscripcion-vencida": 403,
  "metodo-no-disponible": 422,
  "not-configured": 503,
  "mp-error": 502,
  "db-error": 500,
};

export const failure = (reason: string, extra: Record<string, unknown> = {}) =>
  json({ ok: false, reason, ...extra }, REASON_STATUS[reason] ?? 400);

export const guardGuestRequest = async (
  req: Request,
  token: string,
  opts: { action: string; perToken: number; perIp: number; windowMs: number; mutating: boolean },
): Promise<NextResponse | null> => {
  if (!qrTokenSchema.safeParse(token).success) return failure("not-found");
  if (opts.mutating && !sameOrigin(req)) return json({ ok: false, reason: "origin" }, 403);

  const porToken = await sharedRateLimit(`m-${opts.action}:${token}`, opts.perToken, opts.windowMs);
  const porIp = await sharedRateLimit(
    `m-${opts.action}:ip:${clientIp(req)}`,
    opts.perIp,
    opts.windowMs,
  );
  if (!porToken.ok || !porIp.ok) {
    const espera = Math.max(porToken.retryAfter, porIp.retryAfter);
    return NextResponse.json(
      { ok: false, reason: "rate-limited" },
      { status: 429, headers: { "Retry-After": String(espera) } },
    );
  }
  return null;
};

export const readJson = async (req: Request): Promise<unknown> => {
  try {
    return await req.json();
  } catch {
    return null;
  }
};
