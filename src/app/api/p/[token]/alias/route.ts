import { NextResponse } from "next/server";
import { sharedRateLimit } from "@/lib/security/rateLimitShared";
import { clientIp } from "@/lib/security/ip";
import { customerAliasSchema, qrTokenSchema } from "@/lib/schemas";
import { updateCustomerOrderAlias } from "@/lib/data/customer-order";

export const dynamic = "force-dynamic";

export const POST = async (
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;

  if (!qrTokenSchema.safeParse(token).success) {
    return NextResponse.json({ ok: false, reason: "not-found" }, { status: 400 });
  }

  const porToken = await sharedRateLimit(`p-alias:${token}`, 8, 60_000);
  const porIp = await sharedRateLimit(`p-alias:ip:${clientIp(req)}`, 30, 60_000);
  if (!porToken.ok || !porIp.ok) {
    const espera = Math.max(porToken.retryAfter, porIp.retryAfter);
    return NextResponse.json(
      { ok: false, reason: "rate-limited" },
      { status: 429, headers: { "Retry-After": String(espera) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }

  const raw =
    body && typeof body === "object" && "alias" in body
      ? (body as { alias: unknown }).alias
      : "";
  if (typeof raw !== "string") {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }

  const parsed = customerAliasSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, reason: "invalid", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  const res = await updateCustomerOrderAlias(token, parsed.data);
  if (!res.ok) {
    const status =
      res.reason === "not-found" || res.reason === "expired"
        ? 404
        : res.reason === "closed"
          ? 409
          : res.reason === "not-configured"
            ? 503
            : 500;
    return NextResponse.json({ ok: false, reason: res.reason }, { status });
  }

  return NextResponse.json({ ok: true, alias: res.alias });
};
