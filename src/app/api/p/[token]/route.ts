import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { sharedRateLimit } from "@/lib/security/rateLimitShared";
import { clientIp } from "@/lib/security/ip";
import { qrTokenSchema } from "@/lib/schemas";
import { markCustomerOrderSeen } from "@/lib/data/customer-order";

export const dynamic = "force-dynamic";

export const GET = async (
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;

  if (!qrTokenSchema.safeParse(token).success) {
    return NextResponse.json({ ok: false, reason: "not-found" });
  }

  /* Dos límites con propósitos distintos:
   *  - por token: que una pantalla trabada no consulte más de lo razonable.
   *  - por IP: techo de costo. Va holgado porque un local con wifi compartida
   *    puede tener treinta clientes esperando detrás de la misma IP. */
  const porToken = await sharedRateLimit(`p:${token}`, 40, 10_000);
  const porIp = await sharedRateLimit(`p:ip:${clientIp(req)}`, 600, 60_000);
  if (!porToken.ok || !porIp.ok) {
    const espera = Math.max(porToken.retryAfter, porIp.retryAfter);
    return NextResponse.json(
      { ok: false, reason: "rate-limited" },
      { status: 429, headers: { "Retry-After": String(espera) } },
    );
  }

  const supabase = createAdminSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not-configured" });
  }

  const { data, error } = await supabase
    .from("pedidos")
    .select(
      "id, referencia, alias_cliente, estado, creado_en, qr_expira_en, visto_en, avisado_en, locales(nombre, modo_identificacion)",
    )
    .eq("qr_token", token)
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, reason: "not-found" });
  }

  if (data.qr_expira_en && new Date(data.qr_expira_en) < new Date()) {
    return NextResponse.json({ ok: false, reason: "expired" });
  }

  /* `visit=1`: el cliente volvió a la pestaña (reescaneo). El poll normal
   * no reescribe visto_en: si lo hiciera, una pestaña en segundo plano
   * cerraría el QR de “Ver QR” sin que nadie escanee. */
  const visit = new URL(req.url).searchParams.get("visit") === "1";
  if (visit) {
    await markCustomerOrderSeen(data.id, "visit");
  } else if (!data.visto_en) {
    await markCustomerOrderSeen(data.id, "first");
  }

  const local = Array.isArray(data.locales) ? data.locales[0] : data.locales;

  return NextResponse.json({
    ok: true,
    reference: data.referencia,
    alias: data.alias_cliente ?? null,
    status: data.estado,
    listo: data.estado === "listo" || data.estado === "retirado",
    notifiedAt: data.avisado_en ?? null,
    createdAt: data.creado_en,
    branchName: local?.nombre ?? "",
    modo: local?.modo_identificacion ?? "pedido",
  });
};
