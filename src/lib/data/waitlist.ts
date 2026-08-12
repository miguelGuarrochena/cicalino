"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  businessDayStart,
  businessDayEnd,
  reservationFetchRange,
} from "@/lib/businessDay";
import { useConfigStore } from "@/lib/store/config-store";
import { isRealBranchId } from "@/lib/data/orders";
import {
  waitlistTransitionSources,
  reservationTransitionSources,
} from "@/lib/schemas";
import { debounced, watchChannel } from "@/lib/realtime";
import { ok, fail, desdeSupabase, type DataResult } from "@/lib/data/result";
import { reportError, reportWarning } from "@/lib/observability";
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
  name: r.nombre,
  partySize: r.personas,
  status: r.estado,
  tableNumber: r.mesa_numero,
  qrToken: r.qr_token,
  createdAt: r.creado_en,
  notifiedAt: r.avisado_en,
  seatedAt: r.sentado_en,
  cancelledAt: r.cancelado_en,
  seenAt: r.visto_en,
  employee: r.empleados?.nombre ?? null,
});

const mapTable = (r: TableRow): TableView => ({
  id: r.id,
  number: r.numero,
  status: r.estado === "ocupada" ? "ocupada" : "libre",
  capacity: Math.max(1, Math.min(50, r.capacidad ?? 4)),
  waitlistId: r.espera_id ?? null,
  reservationId: r.reserva_id ?? null,
});

const mapReservation = (r: ReservationRow, tableNumbers?: number[]): ReservationView => {
  const raw =
    tableNumbers?.length
      ? tableNumbers
      : r.mesas_numeros?.length
        ? r.mesas_numeros
        : [r.mesa_numero];
  const nums = [...new Set(raw)].filter((n) => n >= 1).sort((a, b) => a - b);
  return {
    id: r.id,
    name: r.nombre,
    partySize: r.personas,
    tableNumber: nums[0] ?? r.mesa_numero,
    tableNumbers: nums,
    scheduledAt: r.horario,
    graceMinutes: r.gracia_minutos === 20 ? 20 : 15,
    status: r.estado,
    createdAt: r.creado_en,
    seatedAt: r.sentado_en,
    cancelledAt: r.cancelado_en,
    expiredAt: r.expirado_en,
    employee: r.empleados?.nombre ?? null,
  };
};

const SELECT_WAITLIST =
  "id, nombre, personas, estado, mesa_numero, qr_token, creado_en, avisado_en, sentado_en, cancelado_en, visto_en, empleados(nombre)";
const SELECT_RESERVATION =
  "id, nombre, personas, mesa_numero, mesas_numeros, horario, gracia_minutos, estado, creado_en, sentado_en, cancelado_en, expirado_en, empleados(nombre)";
const SELECT_TABLE = "id, numero, estado, capacidad, espera_id, reserva_id";

/* Mismo criterio que en pedidos: el techo lo ponemos nosotros para que el
 * corte sea visible y no lo decida el max-rows de PostgREST en silencio. */
const MAX_FILAS_JORNADA = 1000;
const cutoffHour = (): number => useConfigStore.getState().cutoffHour;
const startOfBusinessDay = (): string => businessDayStart(cutoffHour()).toISOString();
const endOfBusinessDay = (): string => businessDayEnd(cutoffHour()).toISOString();

/* Sync the table list to `cantidad` tables.
 *
 * The old version read the existing numbers, worked out the missing ones and
 * inserted them. Two tabs opening the panel at once computed the same list and
 * both tried to insert it; the unique index caught the second, but the error
 * was thrown away and the function carried on.
 *
 * It also deleted extras checking only `estado = 'libre'`, so a table sitting
 * free but still linked to a waitlist entry could be deleted under it. The
 * function checks the links too. */
export const syncTables = async (
  branchId: string,
  cantidad: number,
): Promise<TableView[]> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return [];
  const n = Math.max(1, Math.min(500, cantidad));

  const { error } = await supabase.rpc("sincronizar_mesas", {
    p_local: branchId,
    p_cantidad: n,
  });
  if (error) console.error("syncTables", error.message);

  const { data, error: errLeer } = await supabase
    .from("mesas")
    .select(SELECT_TABLE)
    .eq("local_id", branchId)
    .lte("numero", n)
    .order("numero");
  if (errLeer) {
    console.error("syncTables/leer", errLeer.message);
    return [];
  }
  return ((data as TableRow[] | null) ?? []).map(mapTable);
};

export const fetchTodayWaitlist = async (
  branchId: string,
): Promise<DataResult<WaitlistView[]>> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return ok([]);
  const { data, error } = await supabase
    .from("esperas")
    .select(SELECT_WAITLIST)
    .eq("local_id", branchId)
    .gte("creado_en", startOfBusinessDay())
    .order("creado_en", { ascending: false })
    .limit(MAX_FILAS_JORNADA);
  if (error) {
    reportError("panel.espera.cargar", error, { branchId });
    return fail(desdeSupabase(error));
  }
  const filas = (data as unknown as WaitlistRow[]) ?? [];
  if (filas.length === MAX_FILAS_JORNADA) {
    reportWarning(
      "panel.espera.cargar",
      `Se alcanzó el techo de ${MAX_FILAS_JORNADA} esperas en la jornada: la lista está incompleta.`,
      { branchId },
    );
  }
  return ok(filas.map(mapWaitlistEntry));
};

export const fetchTables = async (
  branchId: string,
): Promise<DataResult<TableView[]>> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return ok([]);
  const { data, error } = await supabase
    .from("mesas")
    .select(SELECT_TABLE)
    .eq("local_id", branchId)
    .order("numero");
  if (error) {
    reportError("panel.mesas.cargar", error, { branchId });
    return fail(desdeSupabase(error));
  }
  return ok(((data as TableRow[] | null) ?? []).map(mapTable));
};

export const fetchTodayReservations = async (
  branchId: string,
): Promise<DataResult<ReservationView[]>> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return ok([]);
  /* No es solo "hoy": el picker cubre 7 días y, antes del corte, una reserva
   * de la mañana siguiente queda fuera de la jornada abierta. Sin este
   * horizonte el panel muestra lista vacía y `crear_reserva` igual rechaza
   * por choque. */
  const { start, end } = reservationFetchRange(cutoffHour());
  const { data, error } = await supabase
    .from("reservas")
    .select(SELECT_RESERVATION)
    .eq("local_id", branchId)
    .gte("horario", start.toISOString())
    .lte("horario", end.toISOString())
    .order("horario", { ascending: true });
  if (error) {
    reportError("panel.reservas.cargar", error, { branchId });
    return fail(desdeSupabase(error));
  }
  return ok(
    ((data as unknown as ReservationRow[]) ?? []).map((r) => mapReservation(r)),
  );
};

/* Vencer las reservas que pasaron su horario más la gracia.
 *
 * Lo hace la base en un solo UPDATE (supabase/reservas-expirar.sql). Antes se
 * bajaban todas las reservas activas para filtrarlas en JS.
 *
 * Ojo: esto es solo para que el panel abierto vea el cambio en el momento. El
 * vencimiento de verdad lo garantiza el cron, porque si nadie abre el panel
 * esta función no corre nunca. */
export const expireOverdueReservations = async (
  branchId: string,
): Promise<void> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return;
  const { error } = await supabase.rpc("expirar_reservas_local", {
    p_local: branchId,
  });
  if (error) console.error("expireOverdueReservations", error.message);
};

export const insertWaitlistEntry = async (args: {
  branchId: string;
  name: string;
  partySize: number;
  employeeId?: string | null;
}): Promise<WaitlistView | null> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return null;
  const nombre = args.name.trim().slice(0, 80) || "Grupo";
  const personas = Math.max(1, Math.min(50, args.partySize || 2));
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
    console.error("insertWaitlistEntry", error.message);
    return null;
  }
  return mapWaitlistEntry(data as unknown as WaitlistRow);
};

export type NewReservationReason =
  | "sin-mesas"
  | "sin-horario"
  | "mesa-inexistente"
  | "capacidad-insuficiente"
  | "choque"
  | "suscripcion-vencida"
  | "error";

export type NewReservationResult =
  | { ok: true; reserva: ReservationView }
  | { ok: false; reason: NewReservationReason };

/* Create a booking.
 *
 * One call to a Postgres function that takes a per-branch advisory lock, so
 * the conflict check and the insert happen with nobody else in between.
 *
 * The old version read the active bookings, checked for conflicts in JS and
 * then inserted: two hosts booking table 5 for 21:00 from two devices both
 * read a clean slate, both passed, and both inserts went through.
 *
 * It also used to return null for all five failure modes, so the panel could
 * only say "couldn't book". Now it says which one. */
export const insertReservation = async (args: {
  branchId: string;
  name: string;
  partySize: number;
  tableNumbers: number[];
  scheduledAt: string;
  graceMinutes: 15 | 20;
  employeeId?: string | null;
}): Promise<NewReservationResult> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return { ok: false, reason: "error" };
  const nums = [...new Set(args.tableNumbers)]
    .filter((n) => n >= 1)
    .sort((a, b) => a - b);
  if (!nums.length) return { ok: false, reason: "sin-mesas" };

  const { data, error } = await supabase.rpc("crear_reserva", {
    p_local: args.branchId,
    p_mesas: nums,
    p_nombre: args.name,
    p_personas: args.partySize,
    p_horario: args.scheduledAt,
    p_gracia: args.graceMinutes,
    p_empleado: args.employeeId ?? null,
  });

  if (error) {
    console.error("insertReservation", error.message);
    return { ok: false, reason: "error" };
  }

  const res = data as
    | { ok: true; reserva: ReservationRow }
    | { ok: false; reason: NewReservationReason }
    | null;

  if (!res?.ok) return { ok: false, reason: res?.reason ?? "error" };
  return { ok: true, reserva: mapReservation(res.reserva, nums) };
};

export type SeatWalkInReason =
  | "sin-mesas"
  | "mesa-no-disponible"
  | "mesa-reservada"
  | "suscripcion-vencida"
  | "error";

export type SeatWalkInResult =
  | { ok: true; espera: WaitlistView }
  | { ok: false; reason: SeatWalkInReason };

/* Seat a walk-in.
 *
 * One call to a Postgres function, which is a single transaction over there:
 * it inserts the waitlist entry and marks the tables, or does nothing.
 *
 * This used to be four separate requests with a hand-written rollback. When
 * that rollback failed, tables were left as 'ocupada' pointing at a deleted
 * waitlist entry — and since the FK is `on delete set null`, they ended up
 * occupied with nothing backing them and no way to free them from the panel.
 *
 * The function also locks the tables, so two counters trying the same table no
 * longer step on each other, and it rejects tables that are inside a
 * reservation's grace period. */
export const seatWalkIn = async (args: {
  branchId: string;
  tableNumbers: number[];
  name?: string;
  partySize?: number;
  employeeId?: string | null;
}): Promise<SeatWalkInResult> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return { ok: false, reason: "error" };
  const nums = [...new Set(args.tableNumbers)]
    .filter((n) => n >= 1)
    .sort((a, b) => a - b);
  if (!nums.length) return { ok: false, reason: "sin-mesas" };

  const { data, error } = await supabase.rpc("sentar_walkin", {
    p_local: args.branchId,
    p_mesas: nums,
    p_nombre: args.name ?? null,
    p_personas: args.partySize ?? null,
    p_empleado: args.employeeId ?? null,
    p_expira: endOfBusinessDay(),
  });

  if (error) {
    console.error("seatWalkIn", error.message);
    return { ok: false, reason: "error" };
  }

  const res = data as
    | { ok: true; espera: WaitlistRow }
    | { ok: false; reason: SeatWalkInReason }
    | null;

  if (!res?.ok) return { ok: false, reason: res?.reason ?? "error" };
  return { ok: true, espera: mapWaitlistEntry(res.espera) };
};

/* El update solo prende si la fila todavía está en un estado desde el que la
 * transición es válida. Antes iba `where id = $1` a secas, así que dos
 * dispositivos del mostrador podían pisarse: uno sentaba al grupo y el otro,
 * con la pantalla vieja, lo cancelaba encima.
 *
 * Devuelve false cuando no afectó ninguna fila, que es justamente el caso
 * "alguien se te adelantó". */
export const updateWaitlistStatus = async (
  id: string,
  estado: WaitlistStatus,
  tableNumber?: number | null,
): Promise<boolean> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return false;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { estado };
  if (estado === "avisado") patch.avisado_en = now;
  if (estado === "sentado") {
    patch.sentado_en = now;
    if (tableNumber != null) patch.mesa_numero = tableNumber;
  }
  if (estado === "cancelado") patch.cancelado_en = now;

  const desde = waitlistTransitionSources(estado);
  if (!desde.length) {
    console.error("updateWaitlistStatus: estado sin origen válido", estado);
    return false;
  }

  const { data, error } = await supabase
    .from("esperas")
    .update(patch)
    .eq("id", id)
    .in("estado", desde)
    .select("id");
  if (error) {
    console.error("updateWaitlistStatus", error.message);
    return false;
  }
  if (!data?.length) {
    console.warn(
      `updateWaitlistStatus: la espera ${id} ya no estaba en ${desde.join("|")}, no se pasó a ${estado}`,
    );
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
    console.error("deleteWaitlistEntry", error.message);
    return false;
  }
  return true;
};

/* Mismo criterio que en updateWaitlistStatus: solo prende si la reserva sigue
 * activa. Evita, por ejemplo, sentar una reserva que el cron ya expiró. */
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

  const desde = reservationTransitionSources(estado);
  if (!desde.length) {
    console.error("updateReservationStatus: estado sin origen válido", estado);
    return false;
  }

  const { data, error } = await supabase
    .from("reservas")
    .update(patch)
    .eq("id", id)
    .in("estado", desde)
    .select("id");
  if (error) {
    console.error("updateReservationStatus", error.message);
    return false;
  }
  if (!data?.length) {
    console.warn(
      `updateReservationStatus: la reserva ${id} ya no estaba activa, no se pasó a ${estado}`,
    );
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
    console.error("setTableCapacity", error.message);
    return false;
  }
  return true;
};

export const setTableState = async (
  branchId: string,
  numero: number,
  estado: TableState,
  opts: { waitlistId?: string | null; reservationId?: string | null } = {},
): Promise<boolean> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return false;
  const patch: Record<string, unknown> = {
    estado,
    actualizado_en: new Date().toISOString(),
  };
  if ("waitlistId" in opts) patch.espera_id = opts.waitlistId ?? null;
  if ("reservationId" in opts) patch.reserva_id = opts.reservationId ?? null;
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
    console.error("setTableState", error.message);
    return false;
  }
  return true;
};

/* ¿El cliente ya abrió el QR de esta espera? Mismo criterio que pedidos:
 * con el modal abierto el panel lo consulta en un intervalo corto. */
export const fetchEsperaSeen = async (id: string): Promise<boolean> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("esperas")
    .select("visto_en")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    reportError("panel.esperas.visto", error, { waitlistId: id });
    return false;
  }
  return Boolean((data as { visto_en: string | null } | null)?.visto_en);
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
