"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import { businessDayStart, businessDayEnd } from "@/lib/businessDay";
import { useConfigStore } from "@/lib/store/config-store";
import { isRealBranchId } from "@/lib/data/orders";
import { conflictingReservation } from "@/lib/reservations";
import { debounced, watchChannel } from "@/lib/realtime";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  WaitlistStatus,
  WaitlistView,
  TableState,
  TableView,
  ReservationStatus,
  ReservationView,
} from "@/lib/types";

export { isRealBranchId };

type WaitlistRow = {
  id: string;
  nombre: string;
  personas: number;
  estado: WaitlistStatus;
  mesa_numero: number | null;
  qr_token: string;
  creado_en: string;
  avisado_en: string | null;
  sentado_en: string | null;
  cancelado_en: string | null;
  visto_en: string | null;
  empleados?: { nombre: string | null } | null;
};

type TableRow = {
  id: string;
  numero: number;
  estado: TableState | "reservada";
  capacidad: number | null;
  espera_id: string | null;
  reserva_id: string | null;
};

type ReservationRow = {
  id: string;
  nombre: string;
  personas: number;
  mesa_numero: number;
  mesas_numeros: number[] | null;
  horario: string;
  gracia_minutos: number;
  estado: ReservationStatus;
  creado_en: string;
  sentado_en: string | null;
  cancelado_en: string | null;
  expirado_en: string | null;
  empleados?: { nombre: string | null } | null;
};

const mapWaitlistEntry = (r: WaitlistRow): WaitlistView => ({
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

const mapTable = (r: TableRow): TableView => ({
  id: r.id,
  numero: r.numero,
  estado: r.estado === "ocupada" ? "ocupada" : "libre",
  capacidad: Math.max(1, Math.min(50, r.capacidad ?? 4)),
  esperaId: r.espera_id ?? null,
  reservaId: r.reserva_id ?? null,
});

const mapReservation = (r: ReservationRow, mesasNumeros?: number[]): ReservationView => {
  const raw =
    mesasNumeros?.length
      ? mesasNumeros
      : r.mesas_numeros?.length
        ? r.mesas_numeros
        : [r.mesa_numero];
  const nums = [...new Set(raw)].filter((n) => n >= 1).sort((a, b) => a - b);
  return {
    id: r.id,
    nombre: r.nombre,
    personas: r.personas,
    mesaNumero: nums[0] ?? r.mesa_numero,
    mesasNumeros: nums,
    horario: r.horario,
    graciaMinutos: r.gracia_minutos === 20 ? 20 : 15,
    estado: r.estado,
    creadoEn: r.creado_en,
    sentadoEn: r.sentado_en,
    canceladoEn: r.cancelado_en,
    expiradoEn: r.expirado_en,
    empleado: r.empleados?.nombre ?? null,
  };
};

const SELECT_WAITLIST = "*, empleados(nombre)";
const SELECT_RESERVATION = "*, empleados(nombre)";
const SELECT_TABLE = "id, numero, estado, capacidad, espera_id, reserva_id";
const cutoffHour = (): number => useConfigStore.getState().horaCorte;
const startOfBusinessDay = (): string => businessDayStart(cutoffHour()).toISOString();
const endOfBusinessDay = (): string => businessDayEnd(cutoffHour()).toISOString();

export const syncTables = async (
  branchId: string,
  cantidad: number,
): Promise<TableView[]> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return [];
  const n = Math.max(1, Math.min(500, cantidad));
  const { data: existing } = await supabase
    .from("mesas")
    .select(SELECT_TABLE)
    .eq("local_id", branchId)
    .order("numero");
  const rows = (existing as TableRow[] | null) ?? [];
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
    .select(SELECT_TABLE)
    .eq("local_id", branchId)
    .lte("numero", n)
    .order("numero");
  return ((data as TableRow[] | null) ?? []).map(mapTable);
};

export const fetchTodayWaitlist = async (
  branchId: string,
): Promise<WaitlistView[]> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("esperas")
    .select(SELECT_WAITLIST)
    .eq("local_id", branchId)
    .gte("creado_en", startOfBusinessDay())
    .order("creado_en", { ascending: false });
  if (error) {
    console.error("fetchTodayEsperas", error.message);
    return [];
  }
  return ((data as unknown as WaitlistRow[]) ?? []).map(mapWaitlistEntry);
};

export const fetchTables = async (branchId: string): Promise<TableView[]> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("mesas")
    .select(SELECT_TABLE)
    .eq("local_id", branchId)
    .order("numero");
  if (error) {
    console.error("fetchMesas", error.message);
    return [];
  }
  return ((data as TableRow[] | null) ?? []).map(mapTable);
};

export const fetchTodayReservations = async (
  branchId: string,
): Promise<ReservationView[]> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("reservas")
    .select(SELECT_RESERVATION)
    .eq("local_id", branchId)
    .gte("horario", startOfBusinessDay())
    .lte("horario", endOfBusinessDay())
    .order("horario", { ascending: true });
  if (error) {
    console.error("fetchTodayReservas", error.message);
    return [];
  }
  return ((data as unknown as ReservationRow[]) ?? []).map((r) => mapReservation(r));
};

export const expireOverdueReservations = async (
  branchId: string,
): Promise<void> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return;
  const { data, error } = await supabase
    .from("reservas")
    .select("id, horario, gracia_minutos")
    .eq("local_id", branchId)
    .eq("estado", "activa");
  if (error || !data?.length) return;

  const now = Date.now();
  const vencidas = (
    data as { id: string; horario: string; gracia_minutos: number }[]
  ).filter((r) => {
    const limite =
      new Date(r.horario).getTime() + (r.gracia_minutos || 15) * 60_000;
    return now > limite;
  });
  if (!vencidas.length) return;

  const nowIso = new Date().toISOString();
  await supabase
    .from("reservas")
    .update({ estado: "expirada", expirado_en: nowIso })
    .in(
      "id",
      vencidas.map((r) => r.id),
    )
    .eq("estado", "activa");
};

export const insertWaitlistEntry = async (args: {
  branchId: string;
  nombre: string;
  personas: number;
  employeeId?: string | null;
}): Promise<WaitlistView | null> => {
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
      qr_expira_en: endOfBusinessDay(),
    })
    .select(SELECT_WAITLIST)
    .single();
  if (error) {
    console.error("insertEspera", error.message);
    return null;
  }
  return mapWaitlistEntry(data as unknown as WaitlistRow);
};

export const insertReservation = async (args: {
  branchId: string;
  nombre: string;
  personas: number;
  mesaNumeros: number[];
  horario: string;
  graciaMinutos: 15 | 20;
  employeeId?: string | null;
}): Promise<ReservationView | null> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return null;
  const nombre = args.nombre.trim().slice(0, 80) || "Reserva";
  const personas = Math.max(1, Math.min(50, args.personas || 2));
  const nums = [...new Set(args.mesaNumeros)]
    .filter((n) => n >= 1)
    .sort((a, b) => a - b);
  if (!nums.length) {
    console.error("insertReserva: sin mesas");
    return null;
  }

  const { data: mesasRows } = await supabase
    .from("mesas")
    .select(SELECT_TABLE)
    .eq("local_id", args.branchId)
    .in("numero", nums);
  const mesasPick = ((mesasRows as TableRow[] | null) ?? []).map(mapTable);
  if (mesasPick.length !== nums.length) {
    console.error("insertReserva: mesa inexistente");
    return null;
  }
  const cap = mesasPick.reduce((s, m) => s + m.capacidad, 0);
  if (cap < personas) {
    console.error("insertReserva: capacidad insuficiente");
    return null;
  }

  const { data: activasRows } = await supabase
    .from("reservas")
    .select(SELECT_RESERVATION)
    .eq("local_id", args.branchId)
    .eq("estado", "activa");
  const activas = ((activasRows as unknown as ReservationRow[]) ?? []).map((r) =>
    mapReservation(r),
  );
  const choque = conflictingReservation(nums, args.horario, activas);
  if (choque) {
    console.error("insertReserva: choca con otra reserva", choque.id);
    return null;
  }

  const primaria = nums[0];
  const { data, error } = await supabase
    .from("reservas")
    .insert({
      local_id: args.branchId,
      nombre,
      personas,
      mesa_numero: primaria,
      mesas_numeros: nums,
      horario: args.horario,
      gracia_minutos: args.graciaMinutos,
      estado: "activa",
      empleado_id: args.employeeId ?? null,
    })
    .select(SELECT_RESERVATION)
    .single();
  if (error) {
    console.error("insertReserva", error.message);
    return null;
  }
  return mapReservation(data as unknown as ReservationRow, nums);
};

export const seatWalkIn = async (args: {
  branchId: string;
  mesaNumeros: number[];
  nombre?: string;
  personas?: number;
  employeeId?: string | null;
}): Promise<WaitlistView | null> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return null;
  const nums = [...new Set(args.mesaNumeros)]
    .filter((n) => n >= 1)
    .sort((a, b) => a - b);
  if (!nums.length) return null;

  const { data: mesasRows } = await supabase
    .from("mesas")
    .select(SELECT_TABLE)
    .eq("local_id", args.branchId)
    .in("numero", nums);
  const mesasPick = ((mesasRows as TableRow[] | null) ?? []).map(mapTable);
  if (mesasPick.length !== nums.length) {
    console.error("ocuparMesasWalkIn: mesa inexistente");
    return null;
  }
  if (mesasPick.some((m) => m.estado !== "libre")) {
    console.error("ocuparMesasWalkIn: mesa no libre");
    return null;
  }
  const cap = mesasPick.reduce((s, m) => s + m.capacidad, 0);
  const personas = Math.max(1, Math.min(50, args.personas ?? cap));
  const nombre = (args.nombre ?? "").trim().slice(0, 80) || "Walk-in";
  const primaria = nums[0];
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("esperas")
    .insert({
      local_id: args.branchId,
      nombre,
      personas,
      estado: "sentado",
      mesa_numero: primaria,
      empleado_id: args.employeeId ?? null,
      qr_token: crypto.randomUUID(),
      qr_expira_en: endOfBusinessDay(),
      sentado_en: now,
    })
    .select(SELECT_WAITLIST)
    .single();
  if (error) {
    console.error("ocuparMesasWalkIn", error.message);
    return null;
  }
  const espera = mapWaitlistEntry(data as unknown as WaitlistRow);
  const marcadas: number[] = [];
  for (const n of nums) {
    const { error: mesaErr, data: updated } = await supabase
      .from("mesas")
      .update({
        estado: "ocupada",
        espera_id: espera.id,
        reserva_id: null,
        actualizado_en: now,
      })
      .eq("local_id", args.branchId)
      .eq("numero", n)
      .eq("estado", "libre")
      .select("id")
      .maybeSingle();
    if (mesaErr || !updated) {
      console.error("ocuparMesasWalkIn mesa", mesaErr?.message ?? "no libre");
      if (marcadas.length) {
        await supabase
          .from("mesas")
          .update({
            estado: "libre",
            espera_id: null,
            actualizado_en: now,
          })
          .eq("local_id", args.branchId)
          .in("numero", marcadas)
          .eq("espera_id", espera.id);
      }
      await supabase.from("esperas").delete().eq("id", espera.id);
      return null;
    }
    marcadas.push(n);
  }
  return espera;
};

export const updateWaitlistStatus = async (
  id: string,
  estado: WaitlistStatus,
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

export const deleteWaitlistEntry = async (id: string): Promise<boolean> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return false;
  await supabase
    .from("mesas")
    .update({
      estado: "libre",
      espera_id: null,
      reserva_id: null,
      actualizado_en: new Date().toISOString(),
    })
    .eq("espera_id", id);
  const { error } = await supabase.from("esperas").delete().eq("id", id);
  if (error) {
    console.error("deleteEspera", error.message);
    return false;
  }
  return true;
};

export const updateReservationStatus = async (
  id: string,
  estado: ReservationStatus,
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

export const setTableCapacity = async (
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

export const setTableState = async (
  branchId: string,
  numero: number,
  estado: TableState,
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

export const subscribeWaitlist = (
  branchId: string,
  onChange: () => void,
  channelSuffix = "",
): { unsubscribe: () => void; isHealthy: () => boolean } => {
  const supabase = createBrowserSupabase();
  if (!supabase) return { unsubscribe: () => {}, isHealthy: () => false };

  const fire = debounced(onChange);
  const filter = `local_id=eq.${branchId}`;
  let channel: RealtimeChannel | null = null;
  let watcher: { state: { healthy: boolean }; dispose: () => void } | null =
    null;
  let disposed = false;

  const connect = () => {
    if (disposed) return;
    if (channel) void supabase.removeChannel(channel);
    watcher?.dispose();
    channel = supabase.channel(`esperas-${branchId}${channelSuffix}`);
    for (const table of ["esperas", "mesas", "reservas"] as const) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter },
        fire,
      );
    }
    watcher = watchChannel(channel, connect);
  };

  connect();

  return {
    unsubscribe: () => {
      disposed = true;
      watcher?.dispose();
      if (channel) void supabase.removeChannel(channel);
    },
    isHealthy: () => watcher?.state.healthy ?? false,
  };
};
