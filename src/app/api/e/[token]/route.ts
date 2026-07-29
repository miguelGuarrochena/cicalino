import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rateLimit";

// GET /api/e/[token] -> estado público de la espera de mesa.

export const dynamic = "force-dynamic";

const TOKEN_RE = /^[a-zA-Z0-9_-]{8,64}$/;

export const GET = async (
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ ok: false, reason: "not-found" });
  }

  const rl = rateLimit(`e:${token}`, 40, 10_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, reason: "rate-limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const supabase = createAdminSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not-configured" });
  }

  const { data, error } = await supabase
    .from("esperas")
    .select(
      "id, nombre, personas, estado, mesa_numero, qr_expira_en, visto_en, avisado_en, locales(nombre)",
    )
    .eq("qr_token", token)
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, reason: "not-found" });
  }

  if (data.qr_expira_en && new Date(data.qr_expira_en) < new Date()) {
    return NextResponse.json({ ok: false, reason: "expired" });
  }

  if (!data.visto_en) {
    await supabase
      .from("esperas")
      .update({ visto_en: new Date().toISOString() })
      .eq("id", data.id);
  }

  const local = Array.isArray(data.locales) ? data.locales[0] : data.locales;

  return NextResponse.json({
    ok: true,
    nombre: data.nombre,
    personas: data.personas,
    estado: data.estado,
    mesaNumero: data.mesa_numero,
    avisado: data.estado === "avisado" || data.estado === "sentado",
    avisadoEn: data.avisado_en ?? null,
    nombreLocal: local?.nombre ?? "",
  });
};
