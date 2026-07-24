import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

// POST /api/push/subscribe
// Body: { token, subscription }. Guarda la suscripción del cliente asociada
// al pedido (resuelto por qr_token). Usa service_role.
export const dynamic = "force-dynamic";

type SubJSON = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export const POST = async (req: Request) => {
  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, reason: "not-configured" });

  const body = (await req.json().catch(() => null)) as {
    token?: string;
    subscription?: SubJSON;
  } | null;
  const token = body?.token;
  const sub = body?.subscription;
  if (!token || !sub?.endpoint) {
    return NextResponse.json({ ok: false, reason: "bad-request" }, { status: 400 });
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
    p256dh: sub.keys?.p256dh ?? "",
    auth: sub.keys?.auth ?? "",
  });
  if (error) {
    console.error("push/subscribe", error.message);
    return NextResponse.json({ ok: false, reason: "db-error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
};
