import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rateLimit";

// POST /api/push/subscribe
// Body: { token, subscription }. Guarda la suscripción del cliente asociada
// al pedido (resuelto por qr_token). Usa service_role.
export const dynamic = "force-dynamic";

type SubJSON = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

// Allowlist de servicios de push reales. `endpoint` lo elige el cliente y el
// server después le hace un POST: sin validar, es un SSRF (el atacante hace que
// nuestro backend pegue a la URL que quiera, incluida la red interna).
const PUSH_HOSTS = [
  "android.googleapis.com",
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "updates-autopush.stage.mozaws.net",
  "web.push.apple.com",
];

const endpointValido = (raw: string): boolean => {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (raw.length > 1000) return false;
  const h = u.hostname.toLowerCase();
  return PUSH_HOSTS.some((d) => h === d || h.endsWith(`.${d}`)) ||
    h.endsWith(".notify.windows.com") ||
    h.endsWith(".push.services.mozilla.com");
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
  if (!token || typeof token !== "string" || token.length > 200) {
    return NextResponse.json({ ok: false, reason: "bad-request" }, { status: 400 });
  }
  if (
    !sub?.endpoint ||
    typeof sub.endpoint !== "string" ||
    !endpointValido(sub.endpoint)
  ) {
    return NextResponse.json({ ok: false, reason: "bad-endpoint" }, { status: 400 });
  }
  // Las claves del navegador son base64url acotado; recortamos por las dudas.
  const p256dh = String(sub.keys?.p256dh ?? "").slice(0, 200);
  const authKey = String(sub.keys?.auth ?? "").slice(0, 100);

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
    p256dh,
    auth: authKey,
  });
  if (error) {
    console.error("push/subscribe", error.message);
    return NextResponse.json({ ok: false, reason: "db-error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
};
