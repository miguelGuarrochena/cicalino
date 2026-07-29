"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import { branchConfigSchema, empleadoSchema, parsear } from "@/lib/schemas";
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
  horaCorte: number;
  /** Contratados en esta sucursal (solo lectura para el dueño). */
  moduloPedidos: boolean;
  moduloEspera: boolean;
}

export const fetchBranchConfig = async (
  branchId: string,
): Promise<BranchConfig | null> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("locales")
    .select(
      "nombre, tipo_negocio, whatsapp, direccion, modo_identificacion, cantidad_mesas, hora_corte, modulo_pedidos, modulo_espera",
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
    horaCorte: data.hora_corte ?? 6,
    moduloPedidos: data.modulo_pedidos !== false,
    moduloEspera: Boolean(data.modulo_espera),
  };
};

export const saveBranchConfig = async (
  branchId: string,
  cfg: BranchConfig,
): Promise<boolean> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return false;
  const v = parsear(branchConfigSchema, {
    ...cfg,
  });
  if (!v.ok) {
    console.error("saveBranchConfig", v.error);
    return false;
  }
  // Los módulos contratados los define el superadmin: no se pisan acá.
  const { error } = await supabase
    .from("locales")
    .update({
      nombre: v.data.nombre,
      tipo_negocio: v.data.tipo,
      whatsapp: v.data.whatsapp,
      direccion: v.data.direccion ?? null,
      modo_identificacion: v.data.modo,
      cantidad_mesas: v.data.cantidadMesas,
      hora_corte: v.data.horaCorte,
      updated_at: new Date().toISOString(),
    })
    .eq("id", branchId);
  if (error) console.error("saveBranchConfig", error.message);
  return !error;
};

// El PIN NO viaja al navegador: la base solo expone `tiene_pin`. Definirlo y
// verificarlo pasa por funciones del servidor (ver security-fixes-03.sql).
type EmpRow = {
  id: string;
  nombre: string;
  rol: string | null;
  tiene_pin: boolean | null;
};

const mapEmp = (r: EmpRow): EmployeeUI => ({
  id: r.id,
  nombre: r.nombre,
  rol: r.rol ?? "",
  tienePin: Boolean(r.tiene_pin),
});

export const fetchEmployees = async (
  branchId: string,
): Promise<EmployeeUI[]> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("empleados")
    .select("id, nombre, rol, tiene_pin")
    .eq("local_id", branchId)
    .eq("activo", true)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as EmpRow[]).map(mapEmp);
};

/** Define o borra el PIN de un empleado (pasa por RPC: se guarda hasheado). */
export const setEmployeePin = async (
  empleadoId: string,
  pin: string,
): Promise<{ ok: true } | { ok: false; error: string }> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return { ok: false, error: "Sin conexión." };
  const { error } = await supabase.rpc("set_empleado_pin", {
    p_empleado: empleadoId,
    p_pin: pin || null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
};

/** Verifica el PIN al fichar. El cliente nunca ve el hash. */
export const verifyEmployeePin = async (
  empleadoId: string,
  pin: string,
): Promise<{ id: string; nombre: string } | null> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("verificar_pin_empleado", {
    p_empleado: empleadoId,
    p_pin: pin,
  });
  if (error) {
    console.error("verifyEmployeePin", error.message);
    return null;
  }
  const fila = Array.isArray(data) ? data[0] : data;
  return fila ? { id: fila.id, nombre: fila.nombre } : null;
};

export const insertEmployee = async (
  branchId: string,
  data: { nombre: string; rol?: string; pin?: string },
): Promise<EmployeeUI | null> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return null;
  const v = parsear(empleadoSchema, data);
  if (!v.ok) {
    console.error("insertEmployee", v.error);
    return null;
  }
  const { data: row, error } = await supabase
    .from("empleados")
    .insert({
      local_id: branchId,
      nombre: v.data.nombre,
      rol: v.data.rol ?? null,
    })
    .select("id, nombre, rol, tiene_pin")
    .single();
  if (error || !row) {
    console.error("insertEmployee", error?.message);
    return null;
  }
  const emp = mapEmp(row as EmpRow);

  // El PIN se setea aparte, por RPC (queda hasheado del lado del servidor).
  // Si falla, rollback: no dejamos un empleado sin el PIN que el admin pidió.
  if (v.data.pin) {
    const res = await setEmployeePin(emp.id, v.data.pin);
    if (!res.ok) {
      console.error("insertEmployee/pin", res.error);
      await supabase.from("empleados").delete().eq("id", emp.id);
      return null;
    }
    return { ...emp, tienePin: true };
  }
  return emp;
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
