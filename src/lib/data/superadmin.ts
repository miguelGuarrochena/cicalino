"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  useSuperadminStore,
  type OrganizationRow,
  type PlanTipo,
} from "@/lib/store/superadmin-store";
import type { BusinessType } from "@/lib/store/config-store";
import { normalizeModules } from "@/lib/pricing";
import { toDateOnly, type SubscriptionStatus } from "@/lib/subscription";

type BranchDb = {
  id: string;
  nombre: string;
  tipo_negocio: BusinessType;
  direccion: string | null;
  modulo_pedidos: boolean | null;
  modulo_espera: boolean | null;
  created_at: string | null;
  cobro_desde: string | null;
  activa: boolean | null;
};
type OrgDb = {
  id: string;
  nombre: string;
  responsable: string | null;
  telefono: string | null;
  cuil: string | null;
  direccion: string | null;
  dueno_email: string;
  cupo: number;
  pagado: boolean;
  activo: boolean;
  plan: string | null;
  mes_gratis_hasta: string | null;
  proximo_cobro_en: string | null;
  contrato_aceptado_en: string | null;
  modulo_pedidos: boolean | null;
  modulo_espera: boolean | null;
  creado_en: string;
  estado_suscripcion: string | null;
  prueba_inicio: string | null;
  prueba_fin: string | null;
  proxima_factura: string | null;
  dia_ciclo: number | null;
  ultimo_pago_en: string | null;
  locales: BranchDb[] | null;
};

const mapOrg = (o: OrgDb): OrganizationRow => {
  const sucursales = (o.locales ?? []).map((l) => {
    const mods = normalizeModules({
      pedidos: l.modulo_pedidos !== false,
      espera: Boolean(l.modulo_espera),
    });
    return {
      id: l.id,
      organizationId: o.id,
      name: l.nombre,
      tipo: l.tipo_negocio ?? "otro",
      direccion: l.direccion ?? "",
      altaEn: l.created_at ?? null,
      cobroDesde: l.cobro_desde ?? null,
      activo: l.activa !== false,
      pedidosHoy: 0,
      moduloPedidos: mods.pedidos,
      moduloEspera: mods.espera,
    };
  });
  const activas = sucursales.filter((s) => s.activo);
  const agg = activas.length
    ? {
        moduloPedidos: activas.some((s) => s.moduloPedidos),
        moduloEspera: activas.some((s) => s.moduloEspera),
      }
    : {
        moduloPedidos: o.modulo_pedidos !== false,
        moduloEspera: Boolean(o.modulo_espera),
      };
  return {
    id: o.id,
    name: o.nombre,
    responsable: o.responsable ?? "",
    telefono: o.telefono ?? "",
    cuil: o.cuil ?? "",
    direccion: o.direccion ?? "",
    ownerEmail: o.dueno_email,
    cupo: o.cupo,
    pagado: o.pagado,
    activo: o.activo,
    plan: (o.plan as PlanTipo) ?? "mensual",
    freeMonthUntil: o.mes_gratis_hasta ?? null,
    nextChargeAt: o.proximo_cobro_en ?? null,
    contractAcceptedAt: o.contrato_aceptado_en ?? null,
    moduloPedidos: agg.moduloPedidos,
    moduloEspera: agg.moduloEspera,
    altaEn: o.creado_en,
    estadoSuscripcion: (o.estado_suscripcion as SubscriptionStatus) ?? "active",
    pruebaInicio: o.prueba_inicio ?? null,
    pruebaFin: o.prueba_fin ?? null,
    proximaFactura: o.proxima_factura ?? null,
    diaCiclo: o.dia_ciclo ?? null,
    ultimoPagoEn: o.ultimo_pago_en ?? null,
    sucursales,
  };
};

export const fetchOrganizations = async (): Promise<OrganizationRow[]> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("organizaciones")
    .select(
      "id, nombre, responsable, telefono, cuil, direccion, dueno_email, cupo, pagado, activo, plan, mes_gratis_hasta, proximo_cobro_en, contrato_aceptado_en, modulo_pedidos, modulo_espera, creado_en, estado_suscripcion, prueba_inicio, prueba_fin, proxima_factura, dia_ciclo, ultimo_pago_en, locales(id, nombre, tipo_negocio, direccion, modulo_pedidos, modulo_espera, created_at, cobro_desde, activa)",
    )
    .order("creado_en", { ascending: false });
  if (error || !data) {
    if (error) console.error("fetchOrganizations", error.message);
    return [];
  }
  return (data as unknown as OrgDb[]).map(mapOrg);
};

let refreshGen = 0;

export const refreshOrganizations = async (): Promise<void> => {
  const gen = ++refreshGen;
  const orgs = await fetchOrganizations();
  if (gen !== refreshGen) return;
  useSuperadminStore.getState().setOrganizaciones(orgs);
};

export const updateOrgDb = async (
  id: string,
  patch: Partial<{
    nombre: string;
    responsable: string;
    telefono: string;
    cuil: string;
    direccion: string;
    ownerEmail: string;
    cupo: number;
    pagado: boolean;
    activo: boolean;
    plan: PlanTipo;
    freeMonthUntil: string | null;
    nextChargeAt: string | null;
    moduloPedidos?: boolean;
    moduloEspera?: boolean;
  }>,
): Promise<void> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return;
  const db: Record<string, unknown> = {};
  if (patch.nombre != null) db.nombre = patch.nombre.trim();
  if (patch.responsable != null) db.responsable = patch.responsable.trim();
  if (patch.telefono != null) db.telefono = patch.telefono.trim() || null;
  if (patch.cuil != null) db.cuil = patch.cuil.trim();
  if (patch.direccion != null) db.direccion = patch.direccion.trim();
  if (patch.ownerEmail != null) db.dueno_email = patch.ownerEmail.trim();
  if (patch.cupo != null) db.cupo = Math.max(1, patch.cupo);
  if (patch.pagado != null) db.pagado = patch.pagado;
  if (patch.activo != null) db.activo = patch.activo;
  if (patch.plan != null) db.plan = patch.plan;
  if (patch.freeMonthUntil !== undefined) db.mes_gratis_hasta = patch.freeMonthUntil;
  if (patch.nextChargeAt !== undefined) db.proximo_cobro_en = patch.nextChargeAt;
  if (patch.moduloPedidos != null) db.modulo_pedidos = patch.moduloPedidos;
  if (patch.moduloEspera != null) db.modulo_espera = patch.moduloEspera;
  const { error } = await supabase
    .from("organizaciones")
    .update(db)
    .eq("id", id);
  if (error) console.error("updateOrgDb", error.message);
};

export const syncOrgModulesFromBranches = async (
  orgId: string,
): Promise<void> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return;
  const { data, error } = await supabase
    .from("locales")
    .select("modulo_pedidos, modulo_espera")
    .eq("organizacion_id", orgId);
  if (error) {
    console.error("syncOrgModulosFromLocales", error.message);
    return;
  }
  const rows = data ?? [];
  const pedidos = rows.some((r) => r.modulo_pedidos !== false) || rows.length === 0;
  const espera = rows.some((r) => Boolean(r.modulo_espera));
  await updateOrgDb(orgId, {
    moduloPedidos: pedidos || !espera,
    moduloEspera: espera,
  });
};

export const insertBranchDb = async (
  orgId: string,
  data: {
    name: string;
    tipo: BusinessType;
    direccion: string;
    whatsapp?: string;
    moduloPedidos?: boolean;
    moduloEspera?: boolean;
  },
): Promise<void> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return;
  const mods = normalizeModules({
    pedidos: data.moduloPedidos,
    espera: data.moduloEspera,
  });
  const slug = `${data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "sucursal"}-${Math.random().toString(36).slice(2, 7)}`;
  const { data: org } = await supabase
    .from("organizaciones")
    .select("proxima_factura")
    .eq("id", orgId)
    .maybeSingle();

  const { error } = await supabase.from("locales").insert({
    organizacion_id: orgId,
    cobro_desde:
      (org as { proxima_factura: string | null } | null)?.proxima_factura ??
      toDateOnly(new Date()),
    nombre: data.name.trim(),
    tipo_negocio: data.tipo,
    direccion: data.direccion.trim() || null,
    whatsapp: data.whatsapp?.trim() || null,
    slug,
    modulo_pedidos: mods.pedidos,
    modulo_espera: mods.espera,
  });
  if (error) console.error("insertBranchDb", error.message);
  else await syncOrgModulesFromBranches(orgId);
};

export const updateBranchIdentityDb = async (
  branchId: string,
  data: {
    nombre?: string;
    tipo?: BusinessType;
    direccion?: string;
    whatsapp?: string;
  },
): Promise<void> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return;
  const db: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (data.nombre != null) db.nombre = data.nombre.trim();
  if (data.tipo != null) db.tipo_negocio = data.tipo;
  if (data.direccion != null) db.direccion = data.direccion.trim() || null;
  if (data.whatsapp != null) db.whatsapp = data.whatsapp.trim() || null;
  const { error } = await supabase.from("locales").update(db).eq("id", branchId);
  if (error) console.error("updateBranchIdentityDb", error.message);
};

export const updateBranchModulesDb = async (
  orgId: string,
  branchId: string,
  mods: { moduloPedidos: boolean; moduloEspera: boolean },
): Promise<void> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return;
  const n = normalizeModules({
    pedidos: mods.moduloPedidos,
    espera: mods.moduloEspera,
  });
  const { error } = await supabase
    .from("locales")
    .update({
      modulo_pedidos: n.pedidos,
      modulo_espera: n.espera,
      updated_at: new Date().toISOString(),
    })
    .eq("id", branchId);
  if (error) console.error("updateBranchModulesDb", error.message);
  else await syncOrgModulesFromBranches(orgId);
};

export const deleteBranchDb = async (id: string): Promise<void> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return;
  const { data: row } = await supabase
    .from("locales")
    .select("organizacion_id")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("locales").delete().eq("id", id);
  if (error) console.error("deleteBranchDb", error.message);
  else if (row?.organizacion_id) {
    await syncOrgModulesFromBranches(row.organizacion_id);
  }
};

export const setBranchActiveDb = async (
  branchId: string,
  activa: boolean,
): Promise<void> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return;
  const { error } = await supabase
    .from("locales")
    .update({ activa, baja_en: activa ? null : new Date().toISOString() })
    .eq("id", branchId);
  if (error) console.error("setBranchActiveDb", error.message);
};

export const setBranchBillingStartDb = async (
  branchId: string,
  desde: string,
): Promise<void> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return;
  const { error } = await supabase
    .from("locales")
    .update({ cobro_desde: desde })
    .eq("id", branchId);
  if (error) console.error("setBranchBillingStartDb", error.message);
};
