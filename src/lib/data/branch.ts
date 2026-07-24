"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import type {
  EmployeeUI,
  IdentificationMode,
  TipoNegocio,
} from "@/lib/store/config-store";

// ---------------------------------------------------------------------------
// Capa de datos de la SUCURSAL: config (tabla `locales`) y empleados
// (tabla `empleados`), con RLS del usuario logueado.
// ---------------------------------------------------------------------------

export interface BranchConfig {
  nombre: string;
  tipo: TipoNegocio;
  whatsapp: string;
  direccion: string;
  modo: IdentificationMode;
  cantidadMesas: number;
}

export const fetchBranchConfig = async (
  branchId: string,
): Promise<BranchConfig | null> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("locales")
    .select(
      "nombre, tipo_negocio, whatsapp, direccion, modo_identificacion, cantidad_mesas",
    )
    .eq("id", branchId)
    .single();
  if (error || !data) return null;
  return {
    nombre: data.nombre ?? "",
    tipo: (data.tipo_negocio as TipoNegocio) ?? "otro",
    whatsapp: data.whatsapp ?? "",
    direccion: data.direccion ?? "",
    modo: (data.modo_identificacion as IdentificationMode) ?? "pedido",
    cantidadMesas: data.cantidad_mesas ?? 10,
  };
};

export const saveBranchConfig = async (
  branchId: string,
  cfg: BranchConfig,
): Promise<boolean> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return false;
  const { error } = await supabase
    .from("locales")
    .update({
      nombre: cfg.nombre,
      tipo_negocio: cfg.tipo,
      whatsapp: cfg.whatsapp,
      direccion: cfg.direccion,
      modo_identificacion: cfg.modo,
      cantidad_mesas: cfg.cantidadMesas,
      updated_at: new Date().toISOString(),
    })
    .eq("id", branchId);
  if (error) console.error("saveBranchConfig", error.message);
  return !error;
};

type EmpRow = {
  id: string;
  nombre: string;
  rol: string | null;
  pin: string | null;
};

const mapEmp = (r: EmpRow): EmployeeUI => ({
  id: r.id,
  nombre: r.nombre,
  rol: r.rol ?? "",
  pin: r.pin ?? "",
});

export const fetchEmployees = async (
  branchId: string,
): Promise<EmployeeUI[]> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("empleados")
    .select("id, nombre, rol, pin")
    .eq("local_id", branchId)
    .eq("activo", true)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as EmpRow[]).map(mapEmp);
};

export const insertEmployee = async (
  branchId: string,
  data: { nombre: string; rol?: string; pin?: string },
): Promise<EmployeeUI | null> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return null;
  const { data: row, error } = await supabase
    .from("empleados")
    .insert({
      local_id: branchId,
      nombre: data.nombre.trim(),
      rol: (data.rol ?? "").trim() || null,
      pin: (data.pin ?? "").replace(/\D/g, "").slice(0, 4) || null,
    })
    .select("id, nombre, rol, pin")
    .single();
  if (error || !row) {
    console.error("insertEmployee", error?.message);
    return null;
  }
  return mapEmp(row as EmpRow);
};

export interface BranchLite {
  id: string;
  nombre: string;
}

// Sucursales de la organización del dueño (para el selector de sucursal).
export const fetchMyBranches = async (
  orgId: string,
): Promise<BranchLite[]> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("locales")
    .select("id, nombre")
    .eq("organizacion_id", orgId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data as BranchLite[];
};

export const removeEmployeeDb = async (id: string): Promise<void> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("empleados").delete().eq("id", id);
  if (error) console.error("removeEmployeeDb", error.message);
};
