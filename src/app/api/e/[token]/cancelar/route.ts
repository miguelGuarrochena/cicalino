import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rateLimit";
import { qrTokenSchema } from "@/lib/schemas";

// POST /api/e/[token]/cancelar
// El comensal cancela su espera (esperando | avisado). Auth por token.

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
    .select("id, estado")
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

  return NextResponse.json({ ok: true });
};
