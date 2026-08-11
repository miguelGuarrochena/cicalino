import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sendBillingReminders } from "@/lib/server/billingReminders";
import { sweepSubscriptions } from "@/lib/server/subscriptionSweep";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOCK = "cobros";
const LOCK_SEGUNDOS = 300;

const igualSeguro = (a: string, b: string): boolean => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
};

/* Este endpoint manda mails a clientes y cambia estados de suscripción, así
 * que la autorización es solo el bearer token.
 *
 * Antes alcanzaba con que llegara la cabecera `x-vercel-cron`, aunque
 * CRON_SECRET estuviera configurado. Vercel normalmente descarta las
 * cabeceras `x-vercel-*` entrantes, pero eso es un detalle de la plataforma,
 * no una garantía nuestra: no es donde queremos apoyar el control de acceso.
 *
 * Vercel Cron manda el header solo: cuando existe la variable de entorno
 * CRON_SECRET, incluye `Authorization: Bearer <CRON_SECRET>` en cada
 * invocación. Sin esa variable el endpoint queda cerrado a propósito. */
export const GET = async (req: Request) => {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) {
    console.error("cron/cobros: falta CRON_SECRET, no se ejecuta el job");
    return NextResponse.json(
      { ok: false, reason: "not-configured" },
      { status: 500 },
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  if (!igualSeguro(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const admin = createAdminSupabase();
  if (!admin) {
    return NextResponse.json(
      { ok: false, reason: "not-configured" },
      { status: 500 },
    );
  }

  /* El lock evita que dos corridas solapadas manden los mails dos veces.
   * Fail-closed si la RPC falla: sin lock, un reintento de Vercel duplicaría
   * cobros/emails. El token de ownership evita que un retry suelte el lock
   * de otra corrida. */
  const { data: lockToken, error: lockErr } = await admin.rpc("tomar_cron_lock", {
    p_nombre: LOCK,
    p_segundos: LOCK_SEGUNDOS,
  });

  if (lockErr) {
    console.error(
      "cron/cobros: no se pudo tomar el lock, aborto. ¿Falta security-fixes-12?",
      lockErr.message,
    );
    return NextResponse.json(
      { ok: false, reason: "lock-unavailable" },
      { status: 503 },
    );
  }
  if (!lockToken) {
    return NextResponse.json({ ok: true, reason: "ya-corriendo", saltado: true });
  }

  try {
    const suscripciones = await sweepSubscriptions();
    const cobros = await sendBillingReminders();

    /* Mantenimiento diario. Ninguno de los dos puede depender de que alguien
     * tenga una pantalla abierta:
     *
     *  - Las reservas vencidas las barría el panel. Si el local cerraba con
     *    reservas activas, al otro día seguían bloqueando la mesa.
     *  - Las suscripciones push no las borraba nadie: la tabla solo crecía. */
    const { data: reservas, error: errRes } = await admin.rpc(
      "expirar_reservas_vencidas",
    );
    if (errRes) console.error("cron/cobros: expirar reservas", errRes.message);

    const { data: push, error: errPush } = await admin.rpc(
      "purgar_push_viejas",
      { p_dias: 3 },
    );
    if (errPush) console.error("cron/cobros: purgar push", errPush.message);

    return NextResponse.json({
      ...cobros,
      suscripciones,
      reservasExpiradas: reservas ?? null,
      pushPurgadas: push ?? null,
    });
  } finally {
    if (typeof lockToken === "string" && lockToken.length > 0) {
      const { error } = await admin.rpc("soltar_cron_lock", {
        p_nombre: LOCK,
        p_token: lockToken,
      });
      if (error) console.error("cron/cobros: no se pudo soltar el lock", error.message);
    }
  }
};
