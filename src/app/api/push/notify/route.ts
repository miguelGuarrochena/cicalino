import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { webpush, vapidConfigurado } from "@/lib/push/server";
import { parsear, pushNotifySchema } from "@/lib/schemas";

// POST /api/push/notify  Body: { orderId }
// Lo llama el panel al marcar "listo" o "Volver a avisar".
// 1) Actualiza avisado_en (la pestaña abierta del cliente lo pollea).
// 2) Si hay VAPID + suscripciones, manda Web Push (también en segundo plano).
export const dynamic = "force-dynamic";

export const POST = async (req: Request) => {
  const v = parsear(pushNotifySchema, await req.json().catch(() => null));
  if (!v.ok) {
    return NextResponse.json({ ok: false, reason: "bad-request" }, { status: 400 });
  }
  const { orderId } = v.data;

  // Autorización: el usuario logueado debe poder ver el pedido (RLS).
  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ ok: false, reason: "not-configured" });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }
  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id, referencia, qr_token")
    .eq("id", orderId)
    .single();
  if (!pedido) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  }

  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, reason: "not-configured" });

  // Siempre: señal para la pestaña abierta (confeti / vibrar / flash).
  const ahora = new Date().toISOString();
  await admin.from("pedidos").update({ avisado_en: ahora }).eq("id", orderId);

  if (!vapidConfigurado) {
    return NextResponse.json({ ok: true, enviados: 0, reason: "no-vapid" });
  }

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("pedido_id", orderId);

  // Tag estable por pedido: reemplaza el aviso en vez de acumular (menos spam).
  const tag = `cicalino-${orderId}`;
  const payload = JSON.stringify({
    titulo: "Cicalino",
    body: `Pedido ${pedido.referencia} listo para retirar.`,
    url: `/p/${pedido.qr_token}`,
    pedidoId: orderId,
    tag,
  });

  let enviados = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      enviados++;
    } catch (err) {
      const code =
        err && typeof err === "object" && "statusCode" in err
          ? (err as { statusCode?: number }).statusCode
          : 0;
      if (code === 404 || code === 410) {
        await admin.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }
  return NextResponse.json({ ok: true, enviados });
};
