import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { sharedRateLimit } from "@/lib/security/rateLimitShared";
import { clientIp } from "@/lib/security/ip";
import { parseInput, pushSubscribeSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

const qrVencido = (qrExpiraEn: string | null | undefined): boolean =>
  Boolean(qrExpiraEn && new Date(qrExpiraEn) < new Date());

export const POST = async (req: Request) => {
  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, reason: "not-configured" });

  const crudo = await req.json().catch(() => null);
  const v = parseInput(pushSubscribeSchema, crudo);
  if (!v.ok) {
    return NextResponse.json(
      { ok: false, reason: "bad-request" },
      { status: 400 },
    );
  }
  const { token, subscription: sub } = v.data;

  const porToken = await sharedRateLimit(`sub:${token}`, 12, 60_000);
  const porIp = await sharedRateLimit(`sub:ip:${clientIp(req)}`, 40, 60_000);
  if (!porToken.ok || !porIp.ok) {
    const espera = Math.max(porToken.retryAfter, porIp.retryAfter);
    return NextResponse.json(
      { ok: false, reason: "rate-limited" },
      { status: 429, headers: { "Retry-After": String(espera) } },
    );
  }

  const { data: pedido } = await admin
    .from("pedidos")
    .select("id, qr_expira_en")
    .eq("qr_token", token)
    .maybeSingle();

  let waitlistId: string | null = null;
  if (pedido) {
    if (qrVencido(pedido.qr_expira_en as string | null)) {
      return NextResponse.json(
        { ok: false, reason: "expired" },
        { status: 410 },
      );
    }
  } else {
    const { data: espera } = await admin
      .from("esperas")
      .select("id, qr_expira_en")
      .eq("qr_token", token)
      .maybeSingle();
    if (!espera) {
      return NextResponse.json(
        { ok: false, reason: "not-found" },
        { status: 404 },
      );
    }
    if (qrVencido(espera.qr_expira_en as string | null)) {
      return NextResponse.json(
        { ok: false, reason: "expired" },
        { status: 410 },
      );
    }
    waitlistId = espera.id;
  }

  /* Upsert por endpoint en vez de delete + insert. El endpoint identifica al
   * navegador, así que reapuntarlo al pedido nuevo es lo que corresponde.
   *
   * Antes eran dos pasos: si algo se cortaba en el medio, el cliente quedaba
   * sin suscripción y sin aviso. Necesita el índice único uq_push_endpoint
   * (supabase/push-indices.sql). */
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      pedido_id: pedido?.id ?? null,
      espera_id: waitlistId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    console.error("push/subscribe", error.message);
    return NextResponse.json({ ok: false, reason: "db-error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
};
