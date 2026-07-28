import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rateLimit";
import { parsear, pushSubscribeSchema } from "@/lib/schemas";

// POST /api/push/subscribe
// Body: { token, subscription }. Guarda la suscripción del cliente asociada
// al pedido (resuelto por qr_token). Usa service_role.
//
// El esquema valida el endpoint contra una allowlist de servicios de push: sin
// eso, el cliente elige a qué URL le pega nuestro backend (SSRF).
export const dynamic = "force-dynamic";

export const POST = async (req: Request) => {
  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, reason: "not-configured" });

  const crudo = await req.json().catch(() => null);
  const v = parsear(pushSubscribeSchema, crudo);
  if (!v.ok) {
    return NextResponse.json(
      { ok: false, reason: "bad-request" },
      { status: 400 },
    );
  }
  const { token, subscription: sub } = v.data;

  // El cliente se suscribe una sola vez; 5/min por token frena inserts abusivos.
  const rl = rateLimit(`sub:${token}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, reason: "rate-limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const { data: pedido } = await admin
    .from("pedidos")
    .select("id")
    .eq("qr_token", token)
    .single();
  if (!pedido) return NextResponse.json({ ok: false, reason: "not-found" });

  // Dedup por endpoint: borramos si existía y volvemos a insertar.
  await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  const { error } = await admin.from("push_subscriptions").insert({
    pedido_id: pedido.id,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
  });
  if (error) {
    console.error("push/subscribe", error.message);
    return NextResponse.json({ ok: false, reason: "db-error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
};
