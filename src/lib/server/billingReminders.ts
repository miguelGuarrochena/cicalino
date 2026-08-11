import "server-only";

import { createAdminSupabase } from "@/lib/supabase/admin";
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
  aviso_interno_en: string | null;
};

const mapRow = (r: {
  id: string;
  nombre: string;
  dueno_email: string;
  activo: boolean;
  plan: string;
  estado_suscripcion: string | null;
  mes_gratis_hasta: string | null;
  proxima_factura: string | null;
  aviso_interno_en: string | null;
}): OrgRow => ({
  id: r.id,
  nombre: r.nombre,
  dueno_email: r.dueno_email,
  activo: r.activo,
  plan: r.plan as OrgBilling["plan"],
  status: (r.estado_suscripcion as OrgBilling["status"]) ?? "active",
  freeMonthUntil: r.mes_gratis_hasta,
  nextInvoice: r.proxima_factura,
  aviso_interno_en: r.aviso_interno_en,
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

/* Helper interno (server-only). Lo llaman el cron (CRON_SECRET) y
 * checkBillingOnAdminOpen (ya gated a superadmin). No es Server Action. */
export const sendBillingReminders = async (): Promise<{
  ok: boolean;
  avisados: number;
}> => {
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, avisados: 0 };

  /* Evita doble mail si el cron y el panel admin corren a la vez. */
  const { data: lockToken, error: lockErr } = await admin.rpc(
    "tomar_cron_lock",
    { p_nombre: "cobros-interno", p_segundos: 120 },
  );
  if (lockErr) {
    console.error("sendBillingReminders/lock", lockErr.message);
    return { ok: false, avisados: 0 };
  }
  if (!lockToken) return { ok: true, avisados: 0 };

  try {
    const { data } = await admin
      .from("organizaciones")
      .select(
        "id, nombre, dueno_email, activo, plan, estado_suscripcion, mes_gratis_hasta, proxima_factura, aviso_interno_en",
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
  } finally {
    await admin.rpc("soltar_cron_lock", {
      p_nombre: "cobros-interno",
      p_token: lockToken,
    });
  }
};
