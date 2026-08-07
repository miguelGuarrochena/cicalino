import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { sharedRateLimit } from "@/lib/security/rateLimitShared";
import { clientIp } from "@/lib/security/ip";
import { qrTokenSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export const GET = async (
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  if (!qrTokenSchema.safeParse(token).success) {
    return NextResponse.json({ ok: false, reason: "not-found" });
  }

  const porToken = await sharedRateLimit(`e:${token}`, 40, 10_000);
  const porIp = await sharedRateLimit(`e:ip:${clientIp(req)}`, 600, 60_000);
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
    .from("esperas")
    .select(
      "id, local_id, nombre, personas, estado, mesa_numero, qr_expira_en, visto_en, avisado_en, creado_en, locales(nombre)",
    )
    .eq("qr_token", token)
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, reason: "not-found" });
  }

  if (data.qr_expira_en && new Date(data.qr_expira_en) < new Date()) {
    return NextResponse.json({ ok: false, reason: "expired" });
  }

  /* Solo la primera vez: sin la guarda, cada poll haría un UPDATE y el panel
   * recibiría un evento de realtime por segundo y por espera. */
  if (!data.visto_en) {
    await supabase
      .from("esperas")
      .update({ visto_en: new Date().toISOString() })
      .eq("id", data.id)
      .is("visto_en", null);
  }

  const local = Array.isArray(data.locales) ? data.locales[0] : data.locales;

  /* La posición la calcula la base con un agregado. Antes se bajaba la cola
   * entera y se contaba en JS: como cada cliente pollea la suya, con la cola
   * larga eso era O(n²) por ciclo. */
  const { data: colaRows, error: colaErr } = await supabase.rpc(
    "cola_de_espera",
    { p_token: token },
  );

  const cola = Array.isArray(colaRows) ? colaRows[0] : colaRows;
  if (colaErr) {
    console.error("api/e cola_de_espera", colaErr.message);
  }

  return NextResponse.json({
    ok: true,
    name: data.nombre,
    partySize: data.personas,
    status: data.estado,
    tableNumber: data.mesa_numero,
    avisado: data.estado === "avisado" || data.estado === "sentado",
    notifiedAt: data.avisado_en ?? null,
    branchName: local?.nombre ?? "",
    cola: {
      gruposDelante: cola?.grupos_delante ?? 0,
      personasDelante: cola?.personas_delante ?? 0,
      gruposEnCola: cola?.grupos_en_cola ?? 0,
      personasEnCola: cola?.personas_en_cola ?? 0,
    },
  });
};
