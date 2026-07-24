import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

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
  const supabase = createAdminSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not-configured" });
  }

  const { data, error } = await supabase
    .from("pedidos")
    .select(
      "id, referencia, estado, qr_expira_en, visto_en, locales(nombre, modo_identificacion)",
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
    nombreLocal: local?.nombre ?? "",
    modo: local?.modo_identificacion ?? "pedido",
  });
};
