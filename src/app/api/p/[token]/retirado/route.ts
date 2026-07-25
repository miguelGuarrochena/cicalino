import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

// POST /api/p/[token]/retirado
// El cliente confirma que retiró su pedido. Pasa de "listo" a "retirado"
// (cierra el pedido y avisa a la caja por realtime). Auth por token.
export const dynamic = "force-dynamic";

export const POST = async (
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, reason: "not-configured" });

  const { error } = await admin
    .from("pedidos")
    .update({ estado: "retirado", retirado_en: new Date().toISOString() })
    .eq("qr_token", token)
    .eq("estado", "listo"); // solo desde "listo"
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
};
