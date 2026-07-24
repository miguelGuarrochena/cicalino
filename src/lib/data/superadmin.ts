"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  useSuperadminStore,
  type OrganizationRow,
  type PlanTipo,
} from "@/lib/store/superadmin-store";
import type { TipoNegocio } from "@/lib/store/config-store";

// ---------------------------------------------------------------------------
// Datos del superadmin: organizaciones + sucursales (tabla locales).
// Lectura/updates van con la sesión del superadmin (RLS lo deja ver todo).
// El alta y la baja de organización van por server action (service_role).
// ---------------------------------------------------------------------------

type BranchDb = {
  id: string;
  nombre: string;
  tipo_negocio: TipoNegocio;
  direccion: string | null;
};
type OrgDb = {
  id: string;
  nombre: string;
  responsable: string | null;
  cuil: string | null;
  direccion: string | null;
  dueno_email: string;
  cupo: number;
  pagado: boolean;
  activo: boolean;
  plan: string | null;
  mes_gratis_hasta: string | null;
  creado_en: string;
  locales: BranchDb[] | null;
};

const mapOrg = (o: OrgDb): OrganizationRow => ({
  id: o.id,
  nombre: o.nombre,
  responsable: o.responsable ?? "",
  cuil: o.cuil ?? "",
  direccion: o.direccion ?? "",
  duenoEmail: o.dueno_email,
  cupo: o.cupo,
  pagado: o.pagado,
  activo: o.activo,
  plan: (o.plan as PlanTipo) ?? "mensual",
  mesGratisHasta: o.mes_gratis_hasta ?? null,
  altaEn: o.creado_en,
  sucursales: (o.locales ?? []).map((l) => ({
    id: l.id,
    organizacionId: o.id,
    nombre: l.nombre,
    tipo: l.tipo_negocio ?? "otro",
    direccion: l.direccion ?? "",
    activo: true, // la tabla locales no tiene columna "activo" (display)
    pedidosHoy: 0,
  })),
});

export const fetchOrganizations = async (): Promise<OrganizationRow[]> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("organizaciones")
    .select(
      "id, nombre, responsable, cuil, direccion, dueno_email, cupo, pagado, activo, plan, mes_gratis_hasta, creado_en, locales(id, nombre, tipo_negocio, direccion)",
    )
    .order("creado_en", { ascending: false });
  if (error || !data) {
    if (error) console.error("fetchOrganizations", error.message);
    return [];
  }
  return (data as unknown as OrgDb[]).map(mapOrg);
};

// Recarga las orgs de la base al store (fuente de la UI del /admin).
export const refreshOrganizations = async (): Promise<void> => {
  const orgs = await fetchOrganizations();
  useSuperadminStore.getState().setOrganizaciones(orgs);
};

export const updateOrgDb = async (
  id: string,
  patch: Partial<{
    nombre: string;
    responsable: string;
    cuil: string;
    direccion: string;
    duenoEmail: string;
    cupo: number;
    pagado: boolean;
    activo: boolean;
    plan: PlanTipo;
    mesGratisHasta: string | null;
  }>,
): Promise<void> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return;
  const db: Record<string, unknown> = {};
  if (patch.nombre != null) db.nombre = patch.nombre.trim();
  if (patch.responsable != null) db.responsable = patch.responsable.trim();
  if (patch.cuil != null) db.cuil = patch.cuil.trim();
  if (patch.direccion != null) db.direccion = patch.direccion.trim();
  if (patch.duenoEmail != null) db.dueno_email = patch.duenoEmail.trim();
  if (patch.cupo != null) db.cupo = Math.max(1, patch.cupo);
  if (patch.pagado != null) db.pagado = patch.pagado;
  if (patch.activo != null) db.activo = patch.activo;
  if (patch.plan != null) db.plan = patch.plan;
  if (patch.mesGratisHasta !== undefined) db.mes_gratis_hasta = patch.mesGratisHasta;
  const { error } = await supabase
    .from("organizaciones")
    .update(db)
    .eq("id", id);
  if (error) console.error("updateOrgDb", error.message);
};

export const insertBranchDb = async (
  orgId: string,
  data: { nombre: string; tipo: TipoNegocio; direccion: string },
): Promise<void> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return;
  const slug = `${data.nombre
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "sucursal"}-${Math.random().toString(36).slice(2, 7)}`;
  const { error } = await supabase.from("locales").insert({
    organizacion_id: orgId,
    nombre: data.nombre.trim(),
    tipo_negocio: data.tipo,
    direccion: data.direccion.trim() || null,
    slug,
  });
  if (error) console.error("insertBranchDb", error.message);
};

export const deleteBranchDb = async (id: string): Promise<void> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("locales").delete().eq("id", id);
  if (error) console.error("deleteBranchDb", error.message);
};
