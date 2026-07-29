import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { webpush, vapidConfigurado } from "@/lib/push/server";
import { parsear, pushNotifySchema } from "@/lib/schemas";

// POST /api/push/notify  Body: { orderId } | { esperaId }
// Pedidos: marcar listo / volver a avisar.
// Espera: avisar que hay mesa.
export const dynamic = "force-dynamic";

export const POST = async (req: Request) => {
  const v = parsear(pushNotifySchema, await req.json().catch(() => null));
  if (!v.ok) {
    return NextResponse.json({ ok: false, reason: "bad-request" }, { status: 400 });
  }
  const { orderId, esperaId } = v.data;

  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ ok: false, reason: "not-configured" });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, reason: "not-configured" });

  const ahora = new Date().toISOString();

  // ── Espera de mesa ──────────────────────────────────────────────────────
  if (esperaId) {
    const { data: espera } = await supabase
      .from("esperas")
      .select("id, nombre, qr_token")
      .eq("id", esperaId)
      .single();
    if (!espera) {
      return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
    }

    await admin
      .from("esperas")
      .update({ avisado_en: ahora })
      .eq("id", esperaId);

    if (!vapidConfigurado) {
      return NextResponse.json({ ok: true, enviados: 0, reason: "no-vapid" });
    }

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("espera_id", esperaId);

    const tag = `cicalino-espera-${esperaId}`;
    const payload = JSON.stringify({
      titulo: "Cicalino",
      body: `¡${espera.nombre}, tu mesa está lista!`,
      url: `/e/${espera.qr_token}`,
      esperaId,
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
  }

  // ── Pedido listo ────────────────────────────────────────────────────────
  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id, referencia, qr_token")
    .eq("id", orderId!)
    .single();
  if (!pedido) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  }

  await admin.from("pedidos").update({ avisado_en: ahora }).eq("id", orderId!);

  if (!vapidConfigurado) {
    return NextResponse.json({ ok: true, enviados: 0, reason: "no-vapid" });
  }

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("pedido_id", orderId!);

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
