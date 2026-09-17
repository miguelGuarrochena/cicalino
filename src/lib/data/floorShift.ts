"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { debounced, watchChannel } from "@/lib/realtime";
import { ok, fail, desdeSupabase, type DataResult } from "@/lib/data/result";
import { reportError } from "@/lib/observability";
import type { ShiftDay, TableAssignment, TemplateRange, FloorTramo } from "@/lib/floorShift";
import { parseTramo } from "@/lib/floorShift";

type RpcOutcome = { ok: true; data: Record<string, unknown> } | { ok: false; reason: string };

const rpc = async (
  fn: string,
  args: Record<string, unknown>,
  scope: string,
): Promise<RpcOutcome> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return { ok: false, reason: "not-configured" };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    reportError(scope, error, args);
    return { ok: false, reason: error.code === "42501" ? "permiso" : "error" };
  }
  const r = (data ?? {}) as Record<string, unknown>;
  return r.ok === false
    ? { ok: false, reason: String(r.reason ?? "error") }
    : { ok: true, data: r };
};

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);

const mapTemplate = (raw: unknown): TemplateRange[] =>
  ((raw as Record<string, unknown>[] | null) ?? []).map((p) => ({
    id: str(p.id),
    weekday: num(p.dia),
    employeeId: str(p.empleado_id),
    employeeName: str(p.empleado_nombre),
    from: num(p.desde),
    to: num(p.hasta),
    tramo: parseTramo(p.tramo),
  }));

const mapShift = (raw: Record<string, unknown>): ShiftDay => ({
  date: str(raw.fecha),
  weekday: num(raw.dia),
  turnosPiso: num(raw.turnos_piso) === 2 ? 2 : 1,
  assignments: ((raw.asignaciones as Record<string, unknown>[] | null) ?? []).map(
    (a): TableAssignment => ({
      tableNumber: num(a.mesa),
      employeeId: strOrNull(a.empleado_id),
      employeeName: strOrNull(a.empleado_nombre),
      tramo: parseTramo(a.tramo),
    }),
  ),
  template: mapTemplate(raw.plantilla),
});

export const fetchFloorShift = async (branchId: string): Promise<DataResult<ShiftDay>> => {
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return ok({ date: "", weekday: 1, assignments: [], template: [], turnosPiso: 1 });
  }
  const { data, error } = await supabase.rpc("mesa_jornada_leer", { p_local: branchId });
  if (error) {
    reportError("panel.jornada.leer", error, { branchId });
    return fail(desdeSupabase(error));
  }
  return ok(mapShift((data ?? {}) as Record<string, unknown>));
};

export const subscribeFloorShift = (
  branchId: string,
  onChange: () => void,
): { unsubscribe: () => void; isHealthy: () => boolean } => {
  const supabase = createBrowserSupabase();
  if (!supabase) return { unsubscribe: () => {}, isHealthy: () => false };

  const fire = debounced(onChange);
  let channel: RealtimeChannel | null = null;
  let watcher: { state: { healthy: boolean }; dispose: () => void } | null = null;
  let disposed = false;

  const connect = () => {
    if (disposed) return;
    if (channel) void supabase.removeChannel(channel);
    watcher?.dispose();
    channel = supabase.channel(`floor-shift-${branchId}`).on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "mesa_asignacion",
        filter: `local_id=eq.${branchId}`,
      },
      fire,
    );
    watcher = watchChannel(channel, connect, fire);
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

export const saveShiftTemplate = (
  branchId: string,
  weekday: number,
  rows: { employeeId: string; from: number; to: number }[],
  tramo: FloorTramo = "manana",
) =>
  rpc(
    "mesa_plantilla_guardar",
    {
      p_local: branchId,
      p_dia: weekday,
      p_tramo: tramo,
      p_filas: rows.map((r) => ({
        empleado_id: r.employeeId,
        desde: r.from,
        hasta: r.to,
      })),
    },
    "panel.jornada.plantilla",
  );

export const saveShiftWeek = (
  branchId: string,
  tramo: FloorTramo,
  rows: { weekday: number; employeeId: string; from: number; to: number }[],
) =>
  rpc(
    "mesa_plantilla_guardar_semana",
    {
      p_local: branchId,
      p_tramo: tramo,
      p_filas: rows.map((r) => ({
        dia: r.weekday,
        empleado_id: r.employeeId,
        desde: r.from,
        hasta: r.to,
      })),
    },
    "panel.jornada.semana",
  );

export const setFloorTurnos = (branchId: string, n: 1 | 2) =>
  rpc(
    "mesa_local_set_turnos",
    { p_local: branchId, p_n: n },
    "panel.jornada.turnos",
  );

export const assignTable = (
  branchId: string,
  tableNumber: number,
  employeeId: string | null,
  actorId: string | null,
  tramo: FloorTramo = "manana",
) =>
  rpc(
    "mesa_jornada_asignar",
    {
      p_local: branchId,
      p_mesa: tableNumber,
      p_empleado: employeeId,
      p_empleado_actor: actorId,
      p_tramo: tramo,
    },
    "panel.jornada.asignar",
  );

export const assignTableRange = (
  branchId: string,
  from: number,
  to: number,
  employeeId: string | null,
  actorId: string | null,
  tramo: FloorTramo = "manana",
) =>
  rpc(
    "mesa_jornada_asignar_rango",
    {
      p_local: branchId,
      p_desde: from,
      p_hasta: to,
      p_empleado: employeeId,
      p_empleado_actor: actorId,
      p_tramo: tramo,
    },
    "panel.jornada.rango",
  );

export const applyShiftTemplate = (branchId: string, force: boolean) =>
  rpc(
    "mesa_jornada_aplicar_plantilla",
    { p_local: branchId, p_forzar: force },
    "panel.jornada.aplicar",
  );
