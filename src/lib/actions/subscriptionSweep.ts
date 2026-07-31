"use server";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { emailLayout } from "@/lib/email/templates";
import { appBaseUrl } from "@/lib/appUrl";
import { toDateOnly, type SubscriptionStatus } from "@/lib/subscription";
import {
  planDailyActions,
  type CronEmail,
  type CronOrg,
} from "@/lib/subscriptionCron";
import type { BillingPlan } from "@/lib/billing";

const esc = (s: string): string =>
  s.replace(/[<>&"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : "&quot;",
  );

const fecha = (iso: string | null): string => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

type Row = {
  id: string;
  nombre: string;
  dueno_email: string;
  plan: string | null;
  estado_suscripcion: string | null;
  prueba_fin: string | null;
  proxima_factura: string | null;
  aviso_prueba_5d_en: string | null;
  aviso_prueba_fin_en: string | null;
  aviso_cobro_en: string | null;
};

const CONTENIDO: Record<
  CronEmail,
  (o: Row) => { subject: string; titulo: string; cuerpo: string }
> = {
  trial_5d: (o) => ({
    subject: "Tu prueba de Cicalino termina en 5 días",
    titulo: "Quedan 5 días de prueba",
    cuerpo: `<p style="margin:0 0 12px;">Tu prueba gratuita termina el <b>${fecha(o.prueba_fin)}</b>.</p>
      <p style="margin:0 0 12px;">Si querés seguir usando Cicalino, escribinos y coordinamos la primera factura, que sería el <b>${fecha(o.proxima_factura)}</b>.</p>
      <p style="margin:0;">Si no te sirvió, no tenés que hacer nada.</p>`,
  }),
  trial_end: (o) => ({
    subject: "Terminó tu prueba de Cicalino",
    titulo: "Terminó la prueba",
    cuerpo: `<p style="margin:0 0 12px;">Tu prueba gratuita terminó el <b>${fecha(o.prueba_fin)}</b>.</p>
      <p style="margin:0;">Para seguir usando la plataforma, escribinos y activamos tu suscripción.</p>`,
  }),
  overdue: (o) => ({
    subject: "Cicalino · pago pendiente",
    titulo: "Pago pendiente",
    cuerpo: `<p style="margin:0 0 12px;">Nos figura pendiente el pago que vencía el <b>${fecha(o.proxima_factura)}</b>.</p>
      <p style="margin:0;">Si ya lo hiciste, avisanos y lo registramos.</p>`,
  }),
};

const MARCA: Record<CronEmail, string> = {
  trial_5d: "aviso_prueba_5d_en",
  trial_end: "aviso_prueba_fin_en",
  overdue: "aviso_cobro_en",
};

export const sweepSubscriptions = async (): Promise<{
  ok: boolean;
  revisadas: number;
  mails: number;
  cambios: number;
}> => {
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, revisadas: 0, mails: 0, cambios: 0 };

  const { data, error } = await admin
    .from("organizaciones")
    .select(
      "id, nombre, dueno_email, plan, estado_suscripcion, prueba_fin, proxima_factura, aviso_prueba_5d_en, aviso_prueba_fin_en, aviso_cobro_en",
    );
  if (error || !data) {
    console.error("sweepSubscriptions", error?.message);
    return { ok: false, revisadas: 0, mails: 0, cambios: 0 };
  }

  const hoy = toDateOnly(new Date());
  const ahora = new Date().toISOString();
  const rows = data as Row[];
  let mails = 0;
  let cambios = 0;

  for (const row of rows) {
    const org: CronOrg = {
      id: row.id,
      plan: (row.plan as BillingPlan) ?? "mensual",
      status: (row.estado_suscripcion as SubscriptionStatus) ?? "active",
      trialEnd: row.prueba_fin,
      nextBilling: row.proxima_factura,
      aviso5dEn: row.aviso_prueba_5d_en,
      avisoFinEn: row.aviso_prueba_fin_en,
      avisoCobroEn: row.aviso_cobro_en,
    };

    const accion = planDailyActions(org, hoy);
    if (!accion.emails.length && !accion.newStatus) continue;

    const patch: Record<string, unknown> = {};

    for (const tipo of accion.emails) {
      const { subject, titulo, cuerpo } = CONTENIDO[tipo](row);
      const enviado = await sendEmail({
        to: row.dueno_email,
        tipo: tipo,
        organizacionId: row.id,
        subject,
        html: emailLayout({
          titulo,
          cuerpoHtml: `<p style="margin:0 0 12px;">Hola, ${esc(row.nombre)}.</p>${cuerpo}`,
          cta: { label: "Abrir Cicalino", url: `${appBaseUrl()}/panel` },
          pie: "Cicalino · aviso automático de suscripción",
        }),
      });
      patch[MARCA[tipo]] = ahora;
      if (enviado) mails++;
    }

    if (accion.newStatus) {
      patch.estado_suscripcion = accion.newStatus;
      if (accion.newStatus === "expired") patch.suspendida_en = ahora;
      if (accion.newStatus === "pending_payment") patch.pagado = false;
      cambios++;
    }

    const { error: errUp } = await admin
      .from("organizaciones")
      .update(patch)
      .eq("id", row.id);
    if (errUp) console.error("sweepSubscriptions/update", errUp.message);
  }

  return { ok: true, revisadas: rows.length, mails, cambios };
};

export const sendWelcomeEmail = async (args: {
  orgId: string;
  nombre: string;
  email: string;
  pruebaFin: string;
  primeraFactura: string;
}): Promise<boolean> => {
  const admin = createAdminSupabase();
  if (!admin) return false;

  const ok = await sendEmail({
    to: args.email,
    tipo: "bienvenida",
    organizacionId: args.orgId,
    subject: "Tu prueba de Cicalino ya empezó",
    html: emailLayout({
      titulo: "Bienvenido a Cicalino",
      cuerpoHtml: `<p style="margin:0 0 12px;">Hola, ${esc(args.nombre)}.</p>
        <p style="margin:0 0 12px;">Tu prueba gratuita de 30 días empezó hoy. Podés usar todas las funciones hasta el <b>${fecha(args.pruebaFin)}</b>.</p>
        <p style="margin:0 0 12px;">Unos días antes te escribimos para ver si querés seguir. Si continuás, la primera factura sería el <b>${fecha(args.primeraFactura)}</b>.</p>
        <p style="margin:0;">Si no te sirve, no tenés que hacer nada.</p>`,
      cta: { label: "Entrar a Cicalino", url: `${appBaseUrl()}/panel` },
      pie: "Cicalino · aviso automático de suscripción",
    }),
  });

  await admin
    .from("organizaciones")
    .update({ bienvenida_en: new Date().toISOString() })
    .eq("id", args.orgId);

  return ok;
};
