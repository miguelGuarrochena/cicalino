import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rateLimit";
import { parseInput, pushSubscribeSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

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
    .maybeSingle();

  let waitlistId: string | null = null;
  if (!pedido) {
    const { data: espera } = await admin
      .from("esperas")
      .select("id")
      .eq("qr_token", token)
      .maybeSingle();
    if (!espera) return NextResponse.json({ ok: false, reason: "not-found" });
    waitlistId = espera.id;
  }

  await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  const { error } = await admin.from("push_subscriptions").insert({
    pedido_id: pedido?.id ?? null,
    espera_id: waitlistId,
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
