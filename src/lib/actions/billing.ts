"use server";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth/profile";
import { sendBillingReminders } from "@/lib/server/billingReminders";
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
      "id, nombre, dueno_email, activo, plan, estado_suscripcion, mes_gratis_hasta, proxima_factura, aviso_interno_en",
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

export const checkBillingOnAdminOpen = async (): Promise<void> => {
  const perfil = await getCurrentProfile();
  if (!perfil || perfil.rol !== "superadmin") return;
  await sendBillingReminders();
};
