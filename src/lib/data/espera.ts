"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import { inicioJornada, finJornada } from "@/lib/businessDay";
import { useConfigStore } from "@/lib/store/config-store";
import { isRealBranchId } from "@/lib/data/orders";
import type { EsperaStatus, EsperaView, MesaView } from "@/lib/types";

export { isRealBranchId };

type EsperaRow = {
  id: string;
  nombre: string;
  personas: number;
  estado: EsperaStatus;
  mesa_numero: number | null;
  qr_token: string;
  creado_en: string;
  avisado_en: string | null;
  sentado_en: string | null;
  cancelado_en: string | null;
  visto_en: string | null;
  empleados?: { nombre: string | null } | null;
};

type MesaRow = {
  id: string;
  numero: number;
  estado: "libre" | "ocupada";
  espera_id: string | null;
};

const mapEspera = (r: EsperaRow): EsperaView => ({
  id: r.id,
  nombre: r.nombre,
  personas: r.personas,
  estado: r.estado,
  mesaNumero: r.mesa_numero,
  qrToken: r.qr_token,
  creadoEn: r.creado_en,
  avisadoEn: r.avisado_en,
  sentadoEn: r.sentado_en,
  canceladoEn: r.cancelado_en,
  vistoEn: r.visto_en,
  empleado: r.empleados?.nombre ?? null,
});

const mapMesa = (r: MesaRow): MesaView => ({
  id: r.id,
  numero: r.numero,
  estado: r.estado,
  esperaId: r.espera_id,
});

const SELECT_ESPERA = "*, empleados(nombre)";
const horaCorte = (): number => useConfigStore.getState().horaCorte;
const inicioDelDia = (): string => inicioJornada(horaCorte()).toISOString();
const finDelDia = (): string => finJornada(horaCorte()).toISOString();

/** Asegura que existan N mesas (1..N) para la sucursal. */
export const syncMesas = async (
  branchId: string,
  cantidad: number,
): Promise<MesaView[]> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return [];
  const n = Math.max(1, Math.min(500, cantidad));
  const { data: existing } = await supabase
    .from("mesas")
    .select("id, numero, estado, espera_id")
    .eq("local_id", branchId)
    .order("numero");
  const rows = (existing as MesaRow[] | null) ?? [];
  const have = new Set(rows.map((r) => r.numero));
  const missing = [];
  for (let i = 1; i <= n; i++) {
    if (!have.has(i)) missing.push({ local_id: branchId, numero: i, estado: "libre" });
  }
  if (missing.length) {
    await supabase.from("mesas").insert(missing);
  }
  // Quitar mesas por encima del cupo solo si están libres
  const extras = rows.filter((r) => r.numero > n && r.estado === "libre");
  if (extras.length) {
    await supabase
      .from("mesas")
      .delete()
      .in(
        "id",
        extras.map((e) => e.id),
      );
  }
  const { data } = await supabase
    .from("mesas")
    .select("id, numero, estado, espera_id")
    .eq("local_id", branchId)
    .lte("numero", n)
    .order("numero");
  return ((data as MesaRow[] | null) ?? []).map(mapMesa);
};

export const fetchTodayEsperas = async (
  branchId: string,
): Promise<EsperaView[]> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("esperas")
    .select(SELECT_ESPERA)
    .eq("local_id", branchId)
    .gte("creado_en", inicioDelDia())
    .order("creado_en", { ascending: false });
  if (error) {
    console.error("fetchTodayEsperas", error.message);
    return [];
  }
  return ((data as unknown as EsperaRow[]) ?? []).map(mapEspera);
};

export const fetchMesas = async (branchId: string): Promise<MesaView[]> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("mesas")
    .select("id, numero, estado, espera_id")
    .eq("local_id", branchId)
    .order("numero");
  if (error) {
    console.error("fetchMesas", error.message);
    return [];
  }
  return ((data as MesaRow[] | null) ?? []).map(mapMesa);
};

export const insertEspera = async (args: {
  branchId: string;
  nombre: string;
  personas: number;
  employeeId?: string | null;
}): Promise<EsperaView | null> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return null;
  const nombre = args.nombre.trim().slice(0, 80) || "Grupo";
  const personas = Math.max(1, Math.min(50, args.personas || 2));
  const { data, error } = await supabase
    .from("esperas")
    .insert({
      local_id: args.branchId,
      nombre,
      personas,
      estado: "esperando",
      empleado_id: args.employeeId ?? null,
      qr_token: crypto.randomUUID().replace(/-/g, ""),
      qr_expira_en: finDelDia(),
    })
    .select(SELECT_ESPERA)
    .single();
  if (error) {
    console.error("insertEspera", error.message);
    return null;
  }
  return mapEspera(data as unknown as EsperaRow);
};

export const updateEsperaStatus = async (
  id: string,
  estado: EsperaStatus,
  mesaNumero?: number | null,
): Promise<boolean> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return false;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { estado };
  if (estado === "avisado") patch.avisado_en = now;
  if (estado === "sentado") {
    patch.sentado_en = now;
    if (mesaNumero != null) patch.mesa_numero = mesaNumero;
  }
  if (estado === "cancelado") patch.cancelado_en = now;
  const { error } = await supabase.from("esperas").update(patch).eq("id", id);
  if (error) {
    console.error("updateEsperaStatus", error.message);
    return false;
  }
  return true;
};

export const setMesaEstado = async (
  branchId: string,
  numero: number,
  estado: "libre" | "ocupada",
  esperaId: string | null = null,
): Promise<boolean> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return false;
  const { error } = await supabase
    .from("mesas")
    .update({
      estado,
      espera_id: esperaId,
      actualizado_en: new Date().toISOString(),
    })
    .eq("local_id", branchId)
    .eq("numero", numero);
  if (error) {
    console.error("setMesaEstado", error.message);
    return false;
  }
  return true;
};

export const subscribeEsperas = (
  branchId: string,
  onChange: () => void,
): (() => void) => {
  const supabase = createBrowserSupabase();
  if (!supabase) return () => undefined;
  const ch = supabase
    .channel(`esperas-${branchId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "esperas", filter: `local_id=eq.${branchId}` },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "mesas", filter: `local_id=eq.${branchId}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
};
