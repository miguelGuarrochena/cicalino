import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { webpush, vapidConfigured } from "@/lib/push/server";
import { parseInput, pushNotifySchema } from "@/lib/schemas";
import { sharedRateLimit } from "@/lib/security/rateLimitShared";
import { clientIp } from "@/lib/security/ip";

export const dynamic = "force-dynamic";

export const POST = async (req: Request) => {
  const v = parseInput(pushNotifySchema, await req.json().catch(() => null));
  if (!v.ok) {
    return NextResponse.json({ ok: false, reason: "bad-request" }, { status: 400 });
  }
  const { orderId, waitlistId } = v.data;

  const supabase = await createServerSupabase();
  if (!supabase) return NextResponse.json({ ok: false, reason: "not-configured" });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const porUser = await sharedRateLimit(`push-notify:u:${user.id}`, 30, 60_000);
  const porIp = await sharedRateLimit(
    `push-notify:ip:${clientIp(req)}`,
    60,
    60_000,
  );
  if (!porUser.ok || !porIp.ok) {
    const espera = Math.max(porUser.retryAfter, porIp.retryAfter);
    return NextResponse.json(
      { ok: false, reason: "rate-limited" },
      { status: 429, headers: { "Retry-After": String(espera) } },
    );
  }

  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, reason: "not-configured" });

  if (!vapidConfigured) {
    return NextResponse.json({ ok: true, enviados: 0, reason: "no-vapid" });
  }

  const ahora = new Date().toISOString();

  if (waitlistId) {
    const { data: espera } = await supabase
      .from("esperas")
      .select("id, nombre, qr_token")
      .eq("id", waitlistId)
      .single();
    if (!espera) {
      return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
    }

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("espera_id", waitlistId);

    const tag = `cicalino-espera-${waitlistId}`;
    const payload = JSON.stringify({
      titulo: "Cicalino",
      body: `¡${espera.nombre}, tu mesa está lista!`,
      url: `/e/${espera.qr_token}`,
      waitlistId,
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

    /* Solo sellar si hubo envío (o no había suscripciones): evita marcar
     * avisado cuando VAPID/envío falló y el cliente nunca vio el push. */
    if (enviados > 0 || !(subs ?? []).length) {
      await admin
        .from("esperas")
        .update({ avisado_en: ahora })
        .eq("id", waitlistId);
    }

    return NextResponse.json({ ok: true, enviados });
  }

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id, referencia, qr_token, estado")
    .eq("id", orderId!)
    .single();
  if (!pedido) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  }

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("pedido_id", orderId!);

  const esRetirado = pedido.estado === "retirado";
  const tag = esRetirado
    ? `cicalino-retirado-${orderId}`
    : `cicalino-${orderId}`;
  const payload = JSON.stringify({
    titulo: "Cicalino",
    body: esRetirado
      ? `Pedido ${pedido.referencia} retirado. Ya podés cerrar la pestaña.`
      : `Pedido ${pedido.referencia} listo para retirar.`,
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

  /* avisado_en solo al marcar listo; en retirado solo avisamos por push. */
  if (!esRetirado && (enviados > 0 || !(subs ?? []).length)) {
    await admin.from("pedidos").update({ avisado_en: ahora }).eq("id", orderId!);
  }

  return NextResponse.json({ ok: true, enviados });
};
