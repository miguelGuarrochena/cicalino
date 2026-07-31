"use server";

import { getCurrentProfile } from "@/lib/auth/profile";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { emailLayout } from "@/lib/email/templates";
import { appBaseUrl } from "@/lib/appUrl";
import { PRICE_PER_BRANCH } from "@/lib/pricing";
import {
  mpAlias,
  contractAmount,
  billingCycleLabel,
  type BillingPlanUI,
} from "@/lib/contract";
import { parseInput, idSchema } from "@/lib/schemas";

type Simple = { ok: true } | { ok: false; error: string };

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (n: number): string =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);

export type BranchRequestAdmin = {
  id: string;
  organizationId: string;
  cupoActual: number;
  cupoPedido: number;
  nombreSucursal: string | null;
  estado: string;
  createdAt: string;
  orgNombre: string;
  orgEmail: string;
  orgPlan: BillingPlanUI;
};

export type QuotaSummary = {
  usadas: number;
  plan: BillingPlanUI;
  activo: boolean;
  pendiente: boolean;
  montoExtra: number;
  ciclo: string;
  alias: string;
};

export const getQuotaSummary = async (): Promise<QuotaSummary | null> => {
  const perfil = await getCurrentProfile();
  if (!perfil || perfil.rol !== "admin" || !perfil.organizationId) return null;
  const admin = createAdminSupabase();
  if (!admin) return null;

  const { data: org } = await admin
    .from("organizaciones")
    .select("id, plan, activo")
    .eq("id", perfil.organizationId)
    .maybeSingle();
  if (!org) return null;

  const { count } = await admin
    .from("locales")
    .select("id", { count: "exact", head: true })
    .eq("organizacion_id", org.id);

  const { data: pend } = await admin
    .from("pedidos_sucursal")
    .select("id")
    .eq("organizacion_id", org.id)
    .eq("estado", "nueva")
    .limit(1)
    .maybeSingle();

  const plan = (org.plan as BillingPlanUI) ?? "mensual";
  return {
    usadas: count ?? 0,
    plan,
    activo: Boolean(org.activo),
    pendiente: Boolean(pend),
    montoExtra: contractAmount(plan === "gratis" ? "mensual" : plan, 1),
    ciclo: billingCycleLabel(plan === "gratis" ? "mensual" : plan),
    alias: mpAlias(),
  };
};

export const requestExtraBranch = async (input: {
  nombreSucursal?: string;
  confirmar: boolean;
}): Promise<Simple> => {
  if (!input.confirmar) {
    return { ok: false, error: "Confirmá que querés contratar otra sucursal." };
  }
  const perfil = await getCurrentProfile();
  if (!perfil || perfil.rol !== "admin" || !perfil.organizationId) {
    return { ok: false, error: "No autorizado" };
  }
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Servicio no configurado." };

  const { data: org } = await admin
    .from("organizaciones")
    .select(
      "id, nombre, dueno_email, responsable, cupo, plan, activo, contrato_aceptado_en",
    )
    .eq("id", perfil.organizationId)
    .maybeSingle();
  if (!org) return { ok: false, error: "Empresa no encontrada." };
  if (!org.activo) {
    return { ok: false, error: "La cuenta está pausada. Escribinos a Cicalino." };
  }
  if (org.plan === "gratis") {
    return {
      ok: false,
      error: "En plan cortesía no se suman sucursales. Escribinos a info@cicalino.net.",
    };
  }

  const { data: ya } = await admin
    .from("pedidos_sucursal")
    .select("id")
    .eq("organizacion_id", org.id)
    .eq("estado", "nueva")
    .limit(1)
    .maybeSingle();
  if (ya) {
    return {
      ok: false,
      error: "Ya tenés un pedido en curso. Te avisamos cuando veamos el pago.",
    };
  }

  const { count: activas } = await admin
    .from("locales")
    .select("id", { count: "exact", head: true })
    .eq("organizacion_id", org.id);
  const cupoActual = Math.max(1, activas ?? 1);
  const cupoPedido = cupoActual + 1;
  const nombre =
    (input.nombreSucursal ?? "").trim().slice(0, 80) || null;

  const { data: pedido, error } = await admin
    .from("pedidos_sucursal")
    .insert({
      organizacion_id: org.id,
      cupo_actual: cupoActual,
      cupo_pedido: cupoPedido,
      nombre_sucursal: nombre,
      estado: "nueva",
    })
    .select("id")
    .single();
  if (error || !pedido) {
    console.error("pedirSucursalExtra", error?.message);
    return { ok: false, error: "No se pudo registrar el pedido." };
  }

  const plan = (org.plan as BillingPlanUI) ?? "mensual";
  const monto = contractAmount(plan, 1);
  const alias = mpAlias();
  const ciclo = billingCycleLabel(plan);
  const contact = org.responsable || org.nombre;
  const notify = process.env.LEAD_NOTIFY_EMAIL ?? "info@cicalino.net";

  await sendEmail({
    to: org.dueno_email,
    subject: "Pedido de sucursal · pago Cicalino",
    html: emailLayout({
      titulo: "Nueva sucursal",
      cuerpoHtml: `<p style="margin:0 0 8px;">¡Hola ${esc(String(contact))}!</p>
        <p style="margin:0 0 12px;">Confirmaste que querés sumar <b>1 sucursal</b> a
        <b>${esc(org.nombre)}</b>${nombre ? ` («${esc(nombre)}»)` : ""}.</p>
        <p style="margin:0 0 8px;">Para activarla, transferí
        <b>${money(monto)}</b> (${ciclo}) al alias de Mercado Pago:</p>
        <p style="margin:0 0 12px;font-size:22px;font-weight:800;letter-spacing:.02em;color:#2536d4;">${esc(alias)}</p>
        <p style="margin:0;font-size:13px;opacity:.75;">En el concepto poné el nombre del local.
        Cuando veamos el pago, la damos de alta y te avisamos.</p>`,
      cta: { label: "Ver bases y condiciones", url: `${appBaseUrl()}/terms` },
      pie: "Cicalino · Si no pediste esto, escribinos a info@cicalino.net.",
    }),
  });

  void sendEmail({
    to: notify,
    subject: `Pedido sucursal: ${org.nombre}`,
    replyTo: org.dueno_email,
    html: emailLayout({
      titulo: "Pedido de sucursal",
      cuerpoHtml: `<p style="margin:0;"><b>${esc(org.nombre)}</b> pide pasar de
        ${cupoActual} → ${cupoPedido} sucursales (${money(monto)} / ${ciclo}).</p>
        <p style="margin:8px 0 0;font-size:14px;">Mail: ${esc(org.dueno_email)}
        ${nombre ? ` · Nueva: ${esc(nombre)}` : ""}</p>
        <p style="margin:8px 0 0;font-size:13px;opacity:.75;">Cuando veas el pago,
        aprobá desde Superadmin y creá la sucursal en el detalle.</p>`,
      cta: { label: "Abrir Superadmin", url: `${appBaseUrl()}/admin` },
    }),
  });

  return { ok: true };
};

export const listBranchRequests = async (): Promise<BranchRequestAdmin[]> => {
  const perfil = await getCurrentProfile();
  if (!perfil || perfil.rol !== "superadmin") return [];
  const admin = createAdminSupabase();
  if (!admin) return [];

  const { data } = await admin
    .from("pedidos_sucursal")
    .select(
      "id, organizacion_id, cupo_actual, cupo_pedido, nombre_sucursal, estado, creado_en, organizaciones(nombre, dueno_email, plan)",
    )
    .eq("estado", "nueva")
    .order("creado_en", { ascending: false });

  type Row = {
    id: string;
    organizacion_id: string;
    cupo_actual: number;
    cupo_pedido: number;
    nombre_sucursal: string | null;
    estado: string;
    creado_en: string;
    organizaciones:
      | { nombre: string; dueno_email: string; plan: string | null }
      | { nombre: string; dueno_email: string; plan: string | null }[]
      | null;
  };

  return ((data ?? []) as unknown as Row[]).map((r) => {
    const org = Array.isArray(r.organizaciones)
      ? r.organizaciones[0]
      : r.organizaciones;
    return {
      id: r.id,
      organizationId: r.organizacion_id,
      cupoActual: r.cupo_actual,
      cupoPedido: r.cupo_pedido,
      nombreSucursal: r.nombre_sucursal,
      estado: r.estado,
      createdAt: r.creado_en,
      orgNombre: org?.nombre ?? "—",
      orgEmail: org?.dueno_email ?? "",
      orgPlan: ((org?.plan as BillingPlanUI) ?? "mensual") as BillingPlanUI,
    };
  });
};

export const approveBranchRequest = async (
  id: string,
): Promise<Simple & { organizationId?: string }> => {
  const perfil = await getCurrentProfile();
  if (!perfil || perfil.rol !== "superadmin") {
    return { ok: false, error: "No autorizado" };
  }
  const v = parseInput(idSchema, { id });
  if (!v.ok) return { ok: false, error: v.error };
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY" };

  const { data: ped } = await admin
    .from("pedidos_sucursal")
    .select("id, organizacion_id, cupo_pedido, nombre_sucursal, estado")
    .eq("id", v.data.id)
    .maybeSingle();
  if (!ped || ped.estado !== "nueva") {
    return { ok: false, error: "Pedido no encontrado o ya atendido." };
  }

  const { data: org } = await admin
    .from("organizaciones")
    .select("id, nombre, dueno_email, plan")
    .eq("id", ped.organizacion_id)
    .maybeSingle();
  if (!org) return { ok: false, error: "Empresa no encontrada." };

  await admin
    .from("pedidos_sucursal")
    .update({ estado: "atendida" })
    .eq("id", ped.id);

  const plan = (org.plan as BillingPlanUI) ?? "mensual";
  void sendEmail({
    to: org.dueno_email,
    subject: "Sucursal habilitada · Cicalino",
    html: emailLayout({
      titulo: "Sucursal habilitada",
      cuerpoHtml: `<p style="margin:0 0 8px;">¡Listo!</p>
        <p style="margin:0;">Habilitamos la sucursal nueva de <b>${esc(org.nombre)}</b>${
          ped.nombre_sucursal
            ? `: «${esc(ped.nombre_sucursal)}»`
            : ""
        }.</p>
        <p style="margin:8px 0 0;">Desde el panel podés operar; si falta crear el local,
        Cicalino lo carga o lo hacemos juntos.</p>
        <p style="margin:8px 0 0;font-size:13px;opacity:.75;">Plan ${esc(billingCycleLabel(plan))}
        · ${money(PRICE_PER_BRANCH)} por sucursal / mes de lista.</p>`,
      cta: { label: "Abrir panel", url: `${appBaseUrl()}/panel` },
    }),
  });

  return { ok: true, organizationId: org.id };
};

export const dismissBranchRequest = async (id: string): Promise<Simple> => {
  const perfil = await getCurrentProfile();
  if (!perfil || perfil.rol !== "superadmin") {
    return { ok: false, error: "No autorizado" };
  }
  const v = parseInput(idSchema, { id });
  if (!v.ok) return { ok: false, error: v.error };
  const admin = createAdminSupabase();
  if (!admin) return { ok: false, error: "Falta SUPABASE_SECRET_KEY" };
  await admin
    .from("pedidos_sucursal")
    .update({ estado: "descartada" })
    .eq("id", v.data.id);
  return { ok: true };
};
