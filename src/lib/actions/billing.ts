"use server";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth/profile";
import { sendEmail } from "@/lib/email/resend";
import { emailLayout } from "@/lib/email/templates";
import { appBaseUrl } from "@/lib/appUrl";
import {
  isOrgBillingDue,
  billingReason,
  type OrgBilling,
} from "@/lib/billing";

type OrgRow = OrgBilling & {
  id: string;
  nombre: string;
  dueno_email: string;
  plan: string;
  aviso_interno_en: string | null;
  mes_gratis_hasta: string | null;
  proximo_cobro_en: string | null;
};

const mapRow = (r: {
  id: string;
  nombre: string;
  dueno_email: string;
  activo: boolean;
  pagado: boolean;
  plan: string;
  mes_gratis_hasta: string | null;
  proximo_cobro_en: string | null;
  aviso_interno_en: string | null;
}): OrgRow => ({
  id: r.id,
  nombre: r.nombre,
  dueno_email: r.dueno_email,
  activo: r.activo,
  pagado: r.pagado,
  plan: r.plan as OrgBilling["plan"],
  freeMonthUntil: r.mes_gratis_hasta,
  nextChargeAt: r.proximo_cobro_en,
  aviso_interno_en: r.aviso_interno_en,
  mes_gratis_hasta: r.mes_gratis_hasta,
  proximo_cobro_en: r.proximo_cobro_en,
});

/* Has the operator already been emailed about this account today?
 *
 * Reads `aviso_interno_en`, which belongs to this reminder alone. It used to
 * share `aviso_cobro_en` with the customer-facing overdue notice in
 * subscriptionCron, so stamping it here could make that one think the customer
 * had already been told. See supabase/aviso-interno.sql. */
const avisadoHoy = (iso: string | null): boolean => {
  if (!iso) return false;
  const a = new Date(iso);
  const n = new Date();
  return (
    a.getFullYear() === n.getFullYear() &&
    a.getMonth() === n.getMonth() &&
    a.getDate() === n.getDate()
  );
};

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const listPendingCharges = async (): Promise<
  { id: string; nombre: string; motivo: string; email: string }[]
> => {
  const perfil = await getCurrentProfile();
  if (!perfil || perfil.rol !== "superadmin") return [];
  const admin = createAdminSupabase();
  if (!admin) return [];

  const { data } = await admin
    .from("organizaciones")
    .select(
      "id, nombre, dueno_email, activo, pagado, plan, mes_gratis_hasta, proximo_cobro_en, aviso_interno_en",
    )
    .eq("activo", true);

  return (data ?? [])
    .map(mapRow)
    .filter(isOrgBillingDue)
    .map((o) => ({
      id: o.id,
      nombre: o.nombre,
      motivo: billingReason(o),
      email: o.dueno_email,
    }));
};

export const sendBillingReminders = async (): Promise<{
  ok: boolean;
  avisados: number;
}> => {
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, avisados: 0 };

  const { data } = await admin
    .from("organizaciones")
    .select(
      "id, nombre, dueno_email, activo, pagado, plan, mes_gratis_hasta, proximo_cobro_en, aviso_interno_en",
    )
    .eq("activo", true);

  const pendientes = (data ?? [])
    .map(mapRow)
    .filter(isOrgBillingDue)
    .filter((o) => !avisadoHoy(o.aviso_interno_en));

  if (pendientes.length === 0) return { ok: true, avisados: 0 };

  const notify = process.env.LEAD_NOTIFY_EMAIL ?? "info@cicalino.net";
  const filas = pendientes
    .map(
      (o) =>
        `<li style="margin:0 0 8px;"><b>${esc(o.nombre)}</b>: ${esc(billingReason(o))}<br/><span style="font-size:13px;opacity:.75;">${esc(o.dueno_email)}</span></li>`,
    )
    .join("");

  const ok = await sendEmail({
    to: notify,
    subject:
      pendientes.length === 1
        ? `Cobro pendiente: ${pendientes[0].nombre}`
        : `${pendientes.length} cobros para revisar · Cicalino`,
    html: emailLayout({
      titulo: "Cobros a revisar",
      cuerpoHtml: `<p style="margin:0 0 12px;">Estas empresas necesitan tu atención de cobro:</p><ul style="margin:0;padding-left:18px;">${filas}</ul>`,
      cta: { label: "Abrir Superadmin", url: `${appBaseUrl()}/admin` },
      pie: "Aviso automático de Cicalino · cobros",
    }),
  });

  if (ok) {
    const ahora = new Date().toISOString();
    await Promise.all(
      pendientes.map((o) =>
        admin
          .from("organizaciones")
          .update({ aviso_interno_en: ahora })
          .eq("id", o.id),
      ),
    );
  }

  return { ok, avisados: ok ? pendientes.length : 0 };
};

export const checkBillingOnAdminOpen = async (): Promise<void> => {
  const perfil = await getCurrentProfile();
  if (!perfil || perfil.rol !== "superadmin") return;
  await sendBillingReminders();
};
