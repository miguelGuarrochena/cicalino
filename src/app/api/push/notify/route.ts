import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { webpush, vapidConfigured } from "@/lib/push/server";
import { parseInput, pushNotifySchema } from "@/lib/schemas";
import { sharedRateLimit } from "@/lib/security/rateLimitShared";
import { clientIp } from "@/lib/security/ip";
import { sameOrigin } from "@/lib/server/tableGuest";

export const dynamic = "force-dynamic";

export const POST = async (req: Request) => {
  if (!sameOrigin(req)) {
    return NextResponse.json({ ok: false, reason: "origin" }, { status: 403 });
  }

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
    .select("id, referencia, qr_token, estado, autoservicio, comensal_id, sesion_id")
    .eq("id", orderId!)
    .single();
  if (!pedido) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  }

  /* Pedidos en modalidad Mesa: el aviso es del comensal (un teléfono puede
   * tener varios pedidos en la mesa) y lleva de vuelta al QR de la mesa. */
  const autoservicio = Boolean(pedido.autoservicio) && Boolean(pedido.comensal_id);
  const { data: subs } = autoservicio
    ? await admin
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .or(`pedido_id.eq.${orderId},comensal_id.eq.${pedido.comensal_id}`)
    : await admin
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("pedido_id", orderId!);

  /* Mostrador QR: el aviso lleva al link de ESE pedido (`/m/<qr_token del
   * pedido>`), no al QR del local: si el encargado lo regeneró mientras
   * esperaba, el aviso sigue abriendo su pedido. Si eligió pagar en caja y
   * todavía no pagó, se lo recuerda. */
  let url = `/p/${pedido.qr_token}`;
  let pagaEnCaja = false;
  if (autoservicio && pedido.sesion_id) {
    const { data: sesion } = await admin
      .from("mesa_sesiones")
      .select("flujo, mesas(qr_token)")
      .eq("id", pedido.sesion_id)
      .maybeSingle();
    const mostradorQr = sesion?.flujo === "mostrador_qr";
    const mesa = sesion?.mesas as { qr_token?: string } | { qr_token?: string }[] | null | undefined;
    const mesaToken = Array.isArray(mesa) ? mesa[0]?.qr_token : mesa?.qr_token;
    if (mostradorQr) url = `/m/${pedido.qr_token}`;
    else if (mesaToken) url = `/m/${mesaToken}`;
    if (mostradorQr) {
      const { count } = await admin
        .from("pagos_mesa")
        .select("id", { count: "exact", head: true })
        .eq("pedido_id", orderId!)
        .eq("estado", "pagado");
      pagaEnCaja = (count ?? 0) === 0;
    }
  }

  const esRetirado = pedido.estado === "retirado";
  const tag = esRetirado
    ? `cicalino-retirado-${orderId}`
    : `cicalino-${orderId}`;
  const payload = JSON.stringify({
    titulo: "Cicalino",
    body: esRetirado
      ? `Pedido ${pedido.referencia} retirado. Ya podés cerrar la pestaña.`
      : pagaEnCaja
        ? `Pedido ${pedido.referencia} listo. Retiralo y pagalo en el mostrador.`
        : autoservicio
          ? `Pedido ${pedido.referencia} listo. Retiralo en el mostrador.`
          : `Pedido ${pedido.referencia} listo para retirar.`,
    url,
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
