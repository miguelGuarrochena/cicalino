"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import { businessDayStart, businessDayEnd } from "@/lib/businessDay";
import { useConfigStore } from "@/lib/store/config-store";
import { newOrderSchema, parseInput, isValidTransition } from "@/lib/schemas";
import { debounced, watchChannel } from "@/lib/realtime";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { OrderStatus, OrderView } from "@/lib/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isRealBranchId = (id: string | null): id is string =>
  !!id && UUID_RE.test(id);

type Row = {
  id: string;
  referencia: string;
  estado: OrderStatus;
  creado_en: string;
  en_preparacion_en: string | null;
  listo_en: string | null;
  retirado_en: string | null;
  cancelado_en: string | null;
  visto_en: string | null;
  qr_token: string;
  empleados?: { nombre: string | null } | null;
};

const mapRow = (r: Row): OrderView => ({
  id: r.id,
  reference: r.referencia,
  status: r.estado,
  createdAt: r.creado_en,
  preparingAt: r.en_preparacion_en,
  readyAt: r.listo_en,
  pickedUpAt: r.retirado_en,
  cancelledAt: r.cancelado_en,
  seenAt: r.visto_en,
  qrToken: r.qr_token,
  employee: r.empleados?.nombre ?? null,
});

const SELECT = "*, empleados(nombre)";

const cutoffHour = (): number => useConfigStore.getState().cutoffHour;
const startOfBusinessDay = (): string => businessDayStart(cutoffHour()).toISOString();
const endOfBusinessDay = (): string => businessDayEnd(cutoffHour()).toISOString();

export const fetchTodayOrders = async (
  branchId: string,
): Promise<OrderView[]> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("pedidos")
    .select(SELECT)
    .eq("local_id", branchId)
    .gte("creado_en", startOfBusinessDay())
    .order("creado_en", { ascending: false });
  if (error) {
    console.error("fetchTodayOrders", error.message);
    return [];
  }
  return (data as unknown as Row[]).map(mapRow);
};

export const fetchBranchName = async (
  branchId: string,
): Promise<string | null> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return null;
  const { data } = await supabase
    .from("locales")
    .select("nombre")
    .eq("id", branchId)
    .single();
  return (data?.nombre as string | undefined) ?? null;
};

export const insertOrder = async (args: {
  branchId: string;
  reference: string;
  employeeId?: string | null;
}): Promise<OrderView | null> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return null;
  const v = parseInput(newOrderSchema, args);
  if (!v.ok) {
    console.error("insertOrder", v.error);
    return null;
  }
  const { data, error } = await supabase
    .from("pedidos")
    .insert({
      local_id: v.data.branchId,
      referencia: v.data.reference,
      estado: "creado",
      empleado_id: v.data.employeeId ?? null,
      qr_token: crypto.randomUUID(),
      qr_expira_en: endOfBusinessDay(),
    })
    .select(SELECT)
    .single();
  if (error) {
    console.error("insertOrder", error.message);
    return null;
  }
  return mapRow(data as unknown as Row);
};

export const updateOrderStatus = async (
  id: string,
  estado: OrderStatus,
  desde?: OrderStatus,
): Promise<void> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return;
  if (desde && !isValidTransition(desde, estado)) {
    console.error("updateOrderStatus: transición inválida", desde, "→", estado);
    return;
  }
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { estado: estado };
  if (estado === "en_preparacion") patch.en_preparacion_en = now;
  else if (estado === "listo") {
    patch.listo_en = now;
    patch.avisado_en = now;
  } else if (estado === "retirado") patch.retirado_en = now;
  else if (estado === "cancelado") patch.cancelado_en = now;

  let q = supabase.from("pedidos").update(patch).eq("id", id);
  if (desde) q = q.eq("estado", desde);
  const { error } = await q;
  if (error) console.error("updateOrderStatus", error.message);
};

export const subscribeOrders = (
  branchId: string,
  onChange: () => void,
): { unsubscribe: () => void; isHealthy: () => boolean } => {
  const supabase = createBrowserSupabase();
  if (!supabase) return { unsubscribe: () => {}, isHealthy: () => false };

  const fire = debounced(onChange);
  let channel: RealtimeChannel | null = null;
  let watcher: { state: { healthy: boolean }; dispose: () => void } | null =
    null;
  let disposed = false;

  const connect = () => {
    if (disposed) return;
    if (channel) void supabase.removeChannel(channel);
    watcher?.dispose();
    channel = supabase.channel(`orders-${branchId}`).on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "pedidos",
        filter: `local_id=eq.${branchId}`,
      },
      fire,
    );
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
