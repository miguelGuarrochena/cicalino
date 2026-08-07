"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import { businessDayStart, businessDayEnd } from "@/lib/businessDay";
import { useConfigStore } from "@/lib/store/config-store";
import { newOrderSchema, parseInput, isValidTransition } from "@/lib/schemas";
import { debounced, watchChannel } from "@/lib/realtime";
import { ok, fail, desdeSupabase, type DataResult } from "@/lib/data/result";
import { reportError } from "@/lib/observability";
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

const SELECT =
  "id, referencia, estado, creado_en, en_preparacion_en, listo_en, retirado_en, cancelado_en, visto_en, qr_token, empleados(nombre)";

const cutoffHour = (): number => useConfigStore.getState().cutoffHour;
const startOfBusinessDay = (): string => businessDayStart(cutoffHour()).toISOString();
const endOfBusinessDay = (): string => businessDayEnd(cutoffHour()).toISOString();

export interface OrdersPage {
  items: OrderView[];
  /* Cuántos pedidos matchean el filtro y la búsqueda actuales. Manda la
   * paginación. */
  total: number;
  /* Cuántos hay bajo cada pestaña de filtro, sobre la jornada entera. Van con
   * la página porque el panel los muestra al lado de cada pestaña, y pedirlos
   * aparte serían dos idas por refresco. */
  conteos: {
    todos: number;
    creado: number;
    listo: number;
    retirado: number;
    cancelado: number;
  };
  proximoNumero: number;
}

export type OrdersFiltro =
  | "todos"
  | "creado"
  | "listo"
  | "retirado"
  | "cancelado";

/* Una página de pedidos de la jornada, con los contadores.
 *
 * Antes el panel se traía el día entero y filtraba, buscaba, ordenaba y
 * paginaba en el navegador. Andaba hasta que el día se hacía grande, y ahí
 * dejaba de andar sin avisar: la lectura estaba topeada en 1000 filas, así
 * que pasado eso la lista quedaba corta y los contadores mentían. */
export const fetchOrdersPage = async (
  branchId: string,
  opts: {
    filtro: OrdersFiltro;
    busqueda: string;
    pagina: number;
    tam: number;
  },
): Promise<DataResult<OrdersPage>> => {
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return ok({
      items: [],
      total: 0,
      conteos: { todos: 0, creado: 0, listo: 0, retirado: 0, cancelado: 0 },
      proximoNumero: 1,
    });
  }

  const { data, error } = await supabase.rpc("pedidos_pagina", {
    p_local: branchId,
    p_desde: startOfBusinessDay(),
    p_filtro: opts.filtro,
    p_busqueda: opts.busqueda,
    p_pagina: opts.pagina,
    p_tam: opts.tam,
  });

  if (error) {
    reportError("panel.pedidos.pagina", error, { branchId });
    return fail(desdeSupabase(error));
  }

  const res = data as {
    items: (Row & { empleado_nombre: string | null })[];
    total: number;
    conteos: OrdersPage["conteos"];
    proximoNumero: number;
  };

  return ok({
    items: (res.items ?? []).map((r) =>
      mapRow({ ...r, empleados: { nombre: r.empleado_nombre } }),
    ),
    total: res.total ?? 0,
    conteos: res.conteos,
    proximoNumero: res.proximoNumero ?? 1,
  });
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

/* ¿El cliente ya abrió el QR de este pedido?
 *
 * El panel cierra el modal del QR cuando aparece `visto_en`, y lo detectaba
 * buscando el pedido en la lista. Con la lista paginada el pedido puede no
 * estar en la página que se ve — un pedido recién creado queda detrás de los
 * que están listos, que van primero.
 *
 * Se llama solo en ese caso y solo con el modal abierto, y se dispara con los
 * eventos de realtime, no con un intervalo. */
export const fetchOrderSeen = async (id: string): Promise<boolean> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("pedidos")
    .select("visto_en")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    reportError("panel.pedidos.visto", error, { orderId: id });
    return false;
  }
  return Boolean((data as { visto_en: string | null } | null)?.visto_en);
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
