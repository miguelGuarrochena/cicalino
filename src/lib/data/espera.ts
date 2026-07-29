"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import { inicioJornada, finJornada } from "@/lib/businessDay";
import { useConfigStore } from "@/lib/store/config-store";
import { isRealBranchId } from "@/lib/data/orders";
import type {
  EsperaStatus,
  EsperaView,
  MesaEstado,
  MesaView,
  ReservaStatus,
  ReservaView,
} from "@/lib/types";

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
  estado: MesaEstado;
  capacidad: number | null;
  espera_id: string | null;
  reserva_id: string | null;
};

type ReservaRow = {
  id: string;
  nombre: string;
  personas: number;
  mesa_numero: number;
  horario: string;
  gracia_minutos: number;
  estado: ReservaStatus;
  creado_en: string;
  sentado_en: string | null;
  cancelado_en: string | null;
  expirado_en: string | null;
  empleados?: { nombre: string | null } | null;
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
  estado: r.estado === "reservada" || r.estado === "ocupada" ? r.estado : "libre",
  capacidad: Math.max(1, Math.min(50, r.capacidad ?? 4)),
  esperaId: r.espera_id ?? null,
  reservaId: r.reserva_id ?? null,
});

const mapReserva = (r: ReservaRow): ReservaView => ({
  id: r.id,
  nombre: r.nombre,
  personas: r.personas,
  mesaNumero: r.mesa_numero,
  horario: r.horario,
  graciaMinutos: r.gracia_minutos === 20 ? 20 : 15,
  estado: r.estado,
  creadoEn: r.creado_en,
  sentadoEn: r.sentado_en,
  canceladoEn: r.cancelado_en,
  expiradoEn: r.expirado_en,
  empleado: r.empleados?.nombre ?? null,
});

const SELECT_ESPERA = "*, empleados(nombre)";
const SELECT_RESERVA = "*, empleados(nombre)";
const SELECT_MESA = "id, numero, estado, capacidad, espera_id, reserva_id";
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
    .select(SELECT_MESA)
    .eq("local_id", branchId)
    .order("numero");
  const rows = (existing as MesaRow[] | null) ?? [];
  const have = new Set(rows.map((r) => r.numero));
  const missing = [];
  for (let i = 1; i <= n; i++) {
    if (!have.has(i))
      missing.push({ local_id: branchId, numero: i, estado: "libre", capacidad: 4 });
  }
  if (missing.length) {
    await supabase.from("mesas").insert(missing);
  }
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
    .select(SELECT_MESA)
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
    .select(SELECT_MESA)
    .eq("local_id", branchId)
    .order("numero");
  if (error) {
    console.error("fetchMesas", error.message);
    return [];
  }
  return ((data as MesaRow[] | null) ?? []).map(mapMesa);
};

export const fetchTodayReservas = async (
  branchId: string,
): Promise<ReservaView[]> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("reservas")
    .select(SELECT_RESERVA)
    .eq("local_id", branchId)
    .gte("horario", inicioDelDia())
    .lte("horario", finDelDia())
    .order("horario", { ascending: true });
  if (error) {
    console.error("fetchTodayReservas", error.message);
    return [];
  }
  return ((data as unknown as ReservaRow[]) ?? []).map(mapReserva);
};

/** Libera mesas de reservas activas cuyo horario + gracia ya pasó. */
export const expirarReservasVencidas = async (
  branchId: string,
): Promise<void> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return;
  const { data, error } = await supabase
    .from("reservas")
    .select("id, mesa_numero, horario, gracia_minutos")
    .eq("local_id", branchId)
    .eq("estado", "activa");
  if (error || !data?.length) return;

  const now = Date.now();
  const vencidas = (
    data as {
      id: string;
      mesa_numero: number;
      horario: string;
      gracia_minutos: number;
    }[]
  ).filter((r) => {
    const limite =
      new Date(r.horario).getTime() + (r.gracia_minutos || 15) * 60_000;
    return now > limite;
  });
  if (!vencidas.length) return;

  const nowIso = new Date().toISOString();
  for (const r of vencidas) {
    await supabase
      .from("reservas")
      .update({ estado: "expirada", expirado_en: nowIso })
      .eq("id", r.id)
      .eq("estado", "activa");
    await supabase
      .from("mesas")
      .update({
        estado: "libre",
        reserva_id: null,
        actualizado_en: nowIso,
      })
      .eq("local_id", branchId)
      .eq("numero", r.mesa_numero)
      .eq("estado", "reservada")
      .eq("reserva_id", r.id);
  }
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
      qr_token: crypto.randomUUID(),
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

export const insertReserva = async (args: {
  branchId: string;
  nombre: string;
  personas: number;
  mesaNumero: number;
  horario: string;
  graciaMinutos: 15 | 20;
  employeeId?: string | null;
}): Promise<ReservaView | null> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return null;
  const nombre = args.nombre.trim().slice(0, 80) || "Reserva";
  const personas = Math.max(1, Math.min(50, args.personas || 2));

  const { data: mesa } = await supabase
    .from("mesas")
    .select(SELECT_MESA)
    .eq("local_id", args.branchId)
    .eq("numero", args.mesaNumero)
    .maybeSingle();
  if (!mesa || (mesa as MesaRow).estado !== "libre") {
    console.error("insertReserva: mesa no libre");
    return null;
  }

  const { data, error } = await supabase
    .from("reservas")
    .insert({
      local_id: args.branchId,
      nombre,
      personas,
      mesa_numero: args.mesaNumero,
      horario: args.horario,
      gracia_minutos: args.graciaMinutos,
      estado: "activa",
      empleado_id: args.employeeId ?? null,
    })
    .select(SELECT_RESERVA)
    .single();
  if (error) {
    console.error("insertReserva", error.message);
    return null;
  }
  const reserva = mapReserva(data as unknown as ReservaRow);
  const { error: mesaErr } = await supabase
    .from("mesas")
    .update({
      estado: "reservada",
      reserva_id: reserva.id,
      espera_id: null,
      actualizado_en: new Date().toISOString(),
    })
    .eq("local_id", args.branchId)
    .eq("numero", args.mesaNumero)
    .eq("estado", "libre");
  if (mesaErr) {
    console.error("insertReserva mesa", mesaErr.message);
    await supabase.from("reservas").delete().eq("id", reserva.id);
    return null;
  }
  return reserva;
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

export const updateReservaStatus = async (
  id: string,
  estado: ReservaStatus,
): Promise<boolean> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return false;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { estado };
  if (estado === "sentada") patch.sentado_en = now;
  if (estado === "cancelada") patch.cancelado_en = now;
  if (estado === "expirada") patch.expirado_en = now;
  const { error } = await supabase.from("reservas").update(patch).eq("id", id);
  if (error) {
    console.error("updateReservaStatus", error.message);
    return false;
  }
  return true;
};

export const setMesaCapacidad = async (
  branchId: string,
  numero: number,
  capacidad: number,
): Promise<boolean> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return false;
  const cap = Math.max(1, Math.min(50, Math.round(capacidad) || 4));
  const { error } = await supabase
    .from("mesas")
    .update({
      capacidad: cap,
      actualizado_en: new Date().toISOString(),
    })
    .eq("local_id", branchId)
    .eq("numero", numero);
  if (error) {
    console.error("setMesaCapacidad", error.message);
    return false;
  }
  return true;
};

export const setMesaEstado = async (
  branchId: string,
  numero: number,
  estado: MesaEstado,
  opts: { esperaId?: string | null; reservaId?: string | null } = {},
): Promise<boolean> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return false;
  const patch: Record<string, unknown> = {
    estado,
    actualizado_en: new Date().toISOString(),
  };
  if ("esperaId" in opts) patch.espera_id = opts.esperaId ?? null;
  if ("reservaId" in opts) patch.reserva_id = opts.reservaId ?? null;
  if (estado === "libre") {
    patch.espera_id = null;
    patch.reserva_id = null;
  }
  const { error } = await supabase
    .from("mesas")
    .update(patch)
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
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "reservas", filter: `local_id=eq.${branchId}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
};
