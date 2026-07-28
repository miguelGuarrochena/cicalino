import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rateLimit";
import { qrTokenSchema } from "@/lib/schemas";

// GET /api/p/[token] -> estado público del pedido para la vista del cliente.
// El cliente no está autenticado, así que leemos con el service_role (saltea
// RLS) pero devolvemos SOLO lo mínimo: referencia, estado, nombre del local y
// modo. El token es largo y no adivinable; valida además que no haya expirado.

export const dynamic = "force-dynamic";

export const GET = async (
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;

  // El qr_token es un UUID v4 que generamos nosotros: cualquier otra cosa ni
  // llega a tocar la base.
  if (!qrTokenSchema.safeParse(token).success) {
    return NextResponse.json({ ok: false, reason: "not-found" });
  }

  // Rate limit por token: el cliente pollea ~cada 1.2s. 40 req/10s deja margen
  // para varias pestañas y reintentos, y corta martilleo.
  const rl = rateLimit(`p:${token}`, 40, 10_000);
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
    .from("pedidos")
    .select(
      "id, referencia, estado, qr_expira_en, visto_en, avisado_en, locales(nombre, modo_identificacion)",
    )
    .eq("qr_token", token)
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, reason: "not-found" });
  }

  if (data.qr_expira_en && new Date(data.qr_expira_en) < new Date()) {
    return NextResponse.json({ ok: false, reason: "expired" });
  }

  // Primera vez que el cliente abre el link: marcar "visto" para que el popup
  // del QR se cierre solo en la caja (por realtime). Solo se setea una vez.
  if (!data.visto_en) {
    await supabase
      .from("pedidos")
      .update({ visto_en: new Date().toISOString() })
      .eq("id", data.id);
  }

  // El join puede venir como objeto o como array según la relación.
  const local = Array.isArray(data.locales) ? data.locales[0] : data.locales;

  return NextResponse.json({
    ok: true,
    referencia: data.referencia,
    estado: data.estado,
    listo: data.estado === "listo" || data.estado === "retirado",
    avisadoEn: data.avisado_en ?? null,
    nombreLocal: local?.nombre ?? "",
    modo: local?.modo_identificacion ?? "pedido",
  });
};
