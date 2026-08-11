"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import { branchOperacionSchema, employeeSchema, parseInput } from "@/lib/schemas";
import { isEmployeeNameTaken } from "@/lib/validations";
import type {
  EmployeeUI,
  IdentificationMode,
  BusinessType,
} from "@/lib/store/config-store";

export interface BranchConfig {
  nombre: string;
  tipo: BusinessType;
  whatsapp: string;
  direccion: string;
  modo: IdentificationMode;
  tableCount: number;
  cutoffHour: number;
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
    tipo: (data.tipo_negocio as BusinessType) ?? "otro",
    whatsapp: data.whatsapp ?? "",
    direccion: data.direccion ?? "",
    modo: (data.modo_identificacion as IdentificationMode) ?? "pedido",
    tableCount: data.cantidad_mesas ?? 10,
    cutoffHour: data.hora_corte ?? 6,
    moduloPedidos: data.modulo_pedidos !== false,
    moduloEspera: Boolean(data.modulo_espera),
  };
};

export const saveBranchConfig = async (
  branchId: string,
  cfg: Pick<BranchConfig, "modo" | "tableCount" | "cutoffHour">,
): Promise<boolean> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return false;
  const v = parseInput(branchOperacionSchema, {
    modo: cfg.modo,
    tableCount: cfg.tableCount,
    cutoffHour: cfg.cutoffHour,
  });
  if (!v.ok) {
    console.error("saveBranchConfig", v.error);
    return false;
  }
  const { error } = await supabase
    .from("locales")
    .update({
      modo_identificacion: v.data.modo,
      cantidad_mesas: v.data.tableCount,
      hora_corte: v.data.cutoffHour,
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
  tiene_pin: boolean | null;
  usuario_id?: string | null;
  usuarios?: { email: string | null } | { email: string | null }[] | null;
};

const emailDe = (r: EmpRow): string | null => {
  const u = r.usuarios;
  if (!u) return null;
  return (Array.isArray(u) ? u[0]?.email : u.email) ?? null;
};

const mapEmp = (r: EmpRow): EmployeeUI => ({
  id: r.id,
  name: r.nombre,
  rol: r.rol ?? "",
  tienePin: Boolean(r.tiene_pin),
  usuarioId: r.usuario_id ?? null,
  email: emailDe(r),
});

export const fetchEmployees = async (
  branchId: string,
): Promise<EmployeeUI[]> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("empleados")
    .select("id, nombre, rol, tiene_pin, usuario_id, usuarios ( email )")
    .eq("local_id", branchId)
    .eq("activo", true)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as unknown as EmpRow[]).map(mapEmp);
};

export interface OwnerUI {
  id: string;
  name: string;
  email: string;
}

export const fetchOwners = async (orgId: string): Promise<OwnerUI[]> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nombre, email")
    .eq("organizacion_id", orgId)
    .eq("rol", "admin")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as { id: string; nombre: string | null; email: string }[]).map(
    (u) => ({ id: u.id, name: u.nombre?.trim() || u.email, email: u.email }),
  );
};

export const setEmployeePin = async (
  employeeId: string,
  pin: string,
): Promise<{ ok: true } | { ok: false; error: string }> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return { ok: false, error: "Sin conexión." };
  const { error } = await supabase.rpc("set_empleado_pin", {
    p_empleado: employeeId,
    p_pin: pin || null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
};

export type InsertEmployeeResult =
  | { ok: true; emp: EmployeeUI }
  | { ok: false; reason: "nombre_dup" | "pin_dup" | "error" };

export const insertEmployee = async (
  branchId: string,
  data: { name: string; rol?: string; pin?: string },
): Promise<InsertEmployeeResult> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return { ok: false, reason: "error" };
  const v = parseInput(employeeSchema, data);
  if (!v.ok) {
    console.error("insertEmployee", v.error);
    return { ok: false, reason: "error" };
  }

  const { data: existentes } = await supabase
    .from("empleados")
    .select("id, nombre")
    .eq("local_id", branchId)
    .eq("activo", true);
  if (
    existentes &&
    isEmployeeNameTaken(
      v.data.name,
      (existentes as { id: string; nombre: string }[]).map((e) => ({
        id: e.id,
        name: e.nombre,
      })),
    )
  ) {
    return { ok: false, reason: "nombre_dup" };
  }

  const { data: row, error } = await supabase
    .from("empleados")
    .insert({
      local_id: branchId,
      nombre: v.data.name,
      rol: v.data.rol ?? null,
    })
    .select("id, nombre, rol, tiene_pin")
    .single();
  if (error || !row) {
    console.error("insertEmployee", error?.message);
    if (error?.code === "23505") return { ok: false, reason: "nombre_dup" };
    return { ok: false, reason: "error" };
  }
  const emp = mapEmp(row as EmpRow);

  if (v.data.pin) {
    const res = await setEmployeePin(emp.id, v.data.pin);
    if (!res.ok) {
      console.error("insertEmployee/pin", res.error);
      await supabase.from("empleados").delete().eq("id", emp.id);
      const msg = res.error.toLowerCase();
      if (msg.includes("ya está en uso") || msg.includes("already")) {
        return { ok: false, reason: "pin_dup" };
      }
      return { ok: false, reason: "error" };
    }
    return { ok: true, emp: { ...emp, tienePin: true } };
  }
  return { ok: true, emp };
};

export interface BranchLite {
  id: string;
  name: string;
}

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
  return (data as { id: string; nombre: string }[]).map((b) => ({
    id: b.id,
    name: b.nombre,
  }));
};

export const removeEmployeeDb = async (id: string): Promise<void> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("empleados").delete().eq("id", id);
  if (error) console.error("removeEmployeeDb", error.message);
};
