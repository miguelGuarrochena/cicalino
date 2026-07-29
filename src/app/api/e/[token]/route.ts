import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rateLimit";
import { qrTokenSchema } from "@/lib/schemas";

// GET /api/e/[token] -> estado público de la espera de mesa.

export const dynamic = "force-dynamic";

export const GET = async (
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  if (!qrTokenSchema.safeParse(token).success) {
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

  if (!data.visto_en) {
    await supabase
      .from("esperas")
      .update({ visto_en: new Date().toISOString() })
      .eq("id", data.id);
  }

  const local = Array.isArray(data.locales) ? data.locales[0] : data.locales;

  let gruposDelante = 0;
  let personasDelante = 0;
  let gruposEnCola = 0;
  let personasEnCola = 0;
  let mesasLibres = 0;
  let mesasQueEntran = 0;

  const { data: cola } = await supabase
    .from("esperas")
    .select("id, personas, creado_en, estado")
    .eq("local_id", data.local_id)
    .in("estado", ["esperando", "avisado"]);

  if (cola?.length) {
    const miCreado = new Date(data.creado_en).getTime();
    for (const row of cola) {
      gruposEnCola += 1;
      personasEnCola += row.personas ?? 0;
      if (row.id === data.id) continue;
      const t = new Date(row.creado_en).getTime();
      if (t < miCreado || (t === miCreado && row.id < data.id)) {
        gruposDelante += 1;
        personasDelante += row.personas ?? 0;
      }
    }
  }

  const { data: mesasRows } = await supabase
    .from("mesas")
    .select("estado, capacidad")
    .eq("local_id", data.local_id)
    .eq("estado", "libre");

  if (mesasRows?.length) {
    const necesitamos = data.personas ?? 1;
    for (const m of mesasRows) {
      mesasLibres += 1;
      if ((m.capacidad ?? 4) >= necesitamos) mesasQueEntran += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    nombre: data.nombre,
    personas: data.personas,
    estado: data.estado,
    mesaNumero: data.mesa_numero,
    avisado: data.estado === "avisado" || data.estado === "sentado",
    avisadoEn: data.avisado_en ?? null,
    nombreLocal: local?.nombre ?? "",
    cola: {
      gruposDelante,
      personasDelante,
      gruposEnCola,
      personasEnCola,
      mesasLibres,
      mesasQueEntran,
    },
  });
};
