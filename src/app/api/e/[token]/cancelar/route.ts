import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { sharedRateLimit } from "@/lib/security/rateLimitShared";
import { clientIp } from "@/lib/security/ip";
import { qrTokenSchema } from "@/lib/schemas";
import { SUPABASE_URL } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

const broadcastGuestCancel = async (args: {
  branchId: string;
  id: string;
  name: string;
}) => {
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "";
  if (!SUPABASE_URL || !key) return;

  /* HTTP broadcast: en serverless el subscribe+send del client a menudo
   * timeoutéa y el mostrador nunca se entera. */
  const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    body: JSON.stringify({
      messages: [
        {
          topic: `realtime:espera-cancel:${args.branchId}`,
          event: "guest-cancel",
          payload: { id: args.id, name: args.name },
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("e/cancelar broadcast http", res.status, body);
  }
};

export const POST = async (
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;

  if (!qrTokenSchema.safeParse(token).success) {
    return NextResponse.json({ ok: false, reason: "not-found" }, { status: 400 });
  }

  /* Este endpoint saca a alguien de la cola, así que el límite por IP es
   * ajustado: un cliente cancela su lugar una vez, no treinta. */
  const porToken = await sharedRateLimit(`e-cancel:${token}`, 5, 60_000);
  const porIp = await sharedRateLimit(`e-cancel:ip:${clientIp(req)}`, 20, 60_000);
  if (!porToken.ok || !porIp.ok) {
    const espera = Math.max(porToken.retryAfter, porIp.retryAfter);
    return NextResponse.json(
      { ok: false, reason: "rate-limited" },
      { status: 429, headers: { "Retry-After": String(espera) } },
    );
  }

  const admin = createAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, reason: "not-configured" });
  }

  const { data, error: findErr } = await admin
    .from("esperas")
    .select("id, estado, nombre, local_id")
    .eq("qr_token", token)
    .maybeSingle();

  if (findErr || !data) {
    return NextResponse.json({ ok: false, reason: "not-found" }, { status: 404 });
  }

  if (data.estado !== "esperando" && data.estado !== "avisado") {
    return NextResponse.json({ ok: false, reason: "closed" }, { status: 409 });
  }

  const { data: updated, error } = await admin
    .from("esperas")
    .update({
      estado: "cancelado",
      cancelado_en: new Date().toISOString(),
    })
    .eq("id", data.id)
    .in("estado", ["esperando", "avisado"])
    .select("id");

  if (error) {
    console.error("e/cancelar", error.message);
    return NextResponse.json({ ok: false, reason: "db-error" }, { status: 500 });
  }
  if (!updated?.length) {
    return NextResponse.json({ ok: false, reason: "closed" }, { status: 409 });
  }

  try {
    await broadcastGuestCancel({
      branchId: data.local_id,
      id: data.id,
      name: data.nombre,
    });
  } catch (e) {
    console.error("e/cancelar broadcast", e);
  }

  return NextResponse.json({ ok: true });
};
