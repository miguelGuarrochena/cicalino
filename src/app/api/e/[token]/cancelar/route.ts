import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rateLimit";
import { qrTokenSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export const POST = async (
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;

  if (!qrTokenSchema.safeParse(token).success) {
    return NextResponse.json({ ok: false, reason: "not-found" }, { status: 400 });
  }

  const rl = rateLimit(`e-cancel:${token}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, reason: "rate-limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
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

  const { error } = await admin
    .from("esperas")
    .update({
      estado: "cancelado",
      cancelado_en: new Date().toISOString(),
    })
    .eq("id", data.id)
    .in("estado", ["esperando", "avisado"]);

  if (error) {
    console.error("e/cancelar", error.message);
    return NextResponse.json({ ok: false, reason: "db-error" }, { status: 500 });
  }

  try {
    const channel = admin.channel(`espera-cancel:${data.local_id}`);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => {
        reject(new Error("broadcast subscribe timeout"));
      }, 2500);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(t);
          resolve();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(t);
          reject(new Error(status));
        }
      });
    });
    await channel.send({
      type: "broadcast",
      event: "guest-cancel",
      payload: { id: data.id, name: data.nombre },
    });
    await admin.removeChannel(channel);
  } catch (e) {
    console.error("e/cancelar broadcast", e);
  }

  return NextResponse.json({ ok: true });
};
