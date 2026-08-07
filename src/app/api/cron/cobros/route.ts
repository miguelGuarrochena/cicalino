import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sendBillingReminders } from "@/lib/actions/billing";
import { sweepSubscriptions } from "@/lib/actions/subscriptionSweep";
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
   * Si todavía no corriste supabase/cron-lock.sql la RPC no existe: en ese
   * caso seguimos igual y lo avisamos. El lock protege de duplicados, no es
   * un control de seguridad, así que no vale la pena romper el cobro por él. */
  const { data: tomado, error: lockErr } = await admin.rpc("tomar_cron_lock", {
    p_nombre: LOCK,
    p_segundos: LOCK_SEGUNDOS,
  });

  if (lockErr) {
    console.warn(
      "cron/cobros: no se pudo tomar el lock, sigo sin él. ¿Falta correr supabase/cron-lock.sql?",
      lockErr.message,
    );
  } else if (tomado === false) {
    return NextResponse.json({ ok: true, reason: "ya-corriendo", saltado: true });
  }

  try {
    const suscripciones = await sweepSubscriptions();
    const cobros = await sendBillingReminders();
    return NextResponse.json({ ...cobros, suscripciones });
  } finally {
    if (!lockErr) {
      const { error } = await admin.rpc("soltar_cron_lock", { p_nombre: LOCK });
      if (error) console.error("cron/cobros: no se pudo soltar el lock", error.message);
    }
  }
};
