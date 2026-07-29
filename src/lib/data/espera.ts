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

const mapReserva = (
  r: ReservaRow,
  mesasNumeros?: number[],
): ReservaView => {
  const nums =
    mesasNumeros && mesasNumeros.length
      ? [...new Set(mesasNumeros)].sort((a, b) => a - b)
      : [r.mesa_numero];
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

/** Completa mesasNumeros mirando qué mesas apuntan a cada reserva. */
export const attachMesasAReservas = (
  reservas: ReservaView[],
  mesas: MesaView[],
): ReservaView[] => {
  const byReserva = new Map<string, number[]>();
  for (const m of mesas) {
    if (!m.reservaId) continue;
    const list = byReserva.get(m.reservaId) ?? [];
    list.push(m.numero);
    byReserva.set(m.reservaId, list);
  }
  return reservas.map((r) => {
    const nums = byReserva.get(r.id);
    if (!nums?.length) {
      return r.mesasNumeros?.length
        ? r
        : { ...r, mesasNumeros: [r.mesaNumero] };
    }
    const sorted = [...new Set(nums)].sort((a, b) => a - b);
    return {
      ...r,
      mesaNumero: sorted[0] ?? r.mesaNumero,
      mesasNumeros: sorted,
    };
  });
};

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
  return ((data as unknown as ReservaRow[]) ?? []).map((r) => mapReserva(r));
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
  mesaNumeros: number[];
  horario: string;
  graciaMinutos: 15 | 20;
  employeeId?: string | null;
}): Promise<ReservaView | null> => {
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
    .select(SELECT_MESA)
    .eq("local_id", args.branchId)
    .in("numero", nums);
  const mesasPick = ((mesasRows as MesaRow[] | null) ?? []).map(mapMesa);
  if (mesasPick.length !== nums.length) {
    console.error("insertReserva: mesa inexistente");
    return null;
  }
  if (mesasPick.some((m) => m.estado !== "libre")) {
    console.error("insertReserva: mesa no libre");
    return null;
  }
  const cap = mesasPick.reduce((s, m) => s + m.capacidad, 0);
  if (cap < personas) {
    console.error("insertReserva: capacidad insuficiente");
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
  const reserva = mapReserva(data as unknown as ReservaRow, nums);
  const nowIso = new Date().toISOString();
  const marcadas: number[] = [];
  for (const n of nums) {
    const { error: mesaErr, data: updated } = await supabase
      .from("mesas")
      .update({
        estado: "reservada",
        reserva_id: reserva.id,
        espera_id: null,
        actualizado_en: nowIso,
      })
      .eq("local_id", args.branchId)
      .eq("numero", n)
      .eq("estado", "libre")
      .select("id")
      .maybeSingle();
    if (mesaErr || !updated) {
      console.error("insertReserva mesa", mesaErr?.message ?? "no libre");
      // Rollback: liberar las ya marcadas y borrar la reserva.
      if (marcadas.length) {
        await supabase
          .from("mesas")
          .update({
            estado: "libre",
            reserva_id: null,
            actualizado_en: nowIso,
          })
          .eq("local_id", args.branchId)
          .in("numero", marcadas)
          .eq("reserva_id", reserva.id);
      }
      await supabase.from("reservas").delete().eq("id", reserva.id);
      return null;
    }
    marcadas.push(n);
  }
  return reserva;
};

/** Walk-in: ocupa mesas ya, sin cola ni QR (queda sentado vinculado a las mesas). */
export const ocuparMesasWalkIn = async (args: {
  branchId: string;
  mesaNumeros: number[];
  nombre?: string;
  personas?: number;
  employeeId?: string | null;
}): Promise<EsperaView | null> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return null;
  const nums = [...new Set(args.mesaNumeros)]
    .filter((n) => n >= 1)
    .sort((a, b) => a - b);
  if (!nums.length) return null;

  const { data: mesasRows } = await supabase
    .from("mesas")
    .select(SELECT_MESA)
    .eq("local_id", args.branchId)
    .in("numero", nums);
  const mesasPick = ((mesasRows as MesaRow[] | null) ?? []).map(mapMesa);
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
      qr_expira_en: finDelDia(),
      sentado_en: now,
    })
    .select(SELECT_ESPERA)
    .single();
  if (error) {
    console.error("ocuparMesasWalkIn", error.message);
    return null;
  }
  const espera = mapEspera(data as unknown as EsperaRow);
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

/** Borra una espera (p. ej. cancelado que ya no hace falta ver). */
export const deleteEspera = async (id: string): Promise<boolean> => {
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
  channelSuffix = "",
): (() => void) => {
  const supabase = createBrowserSupabase();
  if (!supabase) return () => undefined;
  const ch = supabase
    .channel(`esperas-${branchId}${channelSuffix}`)
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
