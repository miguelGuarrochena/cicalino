"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import { businessDayStart, businessDayEnd } from "@/lib/businessDay";
import { useConfigStore } from "@/lib/store/config-store";
import { newOrderSchema, parseInput, orderTransitionSources } from "@/lib/schemas";
import { debounced, watchChannel } from "@/lib/realtime";
import { ok, fail, desdeSupabase, type DataResult } from "@/lib/data/result";
import { reportError, reportWarning } from "@/lib/observability";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { OrderStatus, OrderView } from "@/lib/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isRealBranchId = (id: string | null): id is string =>
  !!id && UUID_RE.test(id);

type Row = {
  id: string;
  referencia: string;
  alias_cliente?: string | null;
  estado: OrderStatus;
  creado_en: string;
  en_preparacion_en: string | null;
  listo_en: string | null;
  retirado_en: string | null;
  cancelado_en: string | null;
  visto_en: string | null;
  qr_token: string;
  avisos_activos?: boolean | null;
  empleados?: { nombre: string | null } | null;
};

const mapRow = (r: Row): OrderView => ({
  id: r.id,
  reference: r.referencia,
  alias: r.alias_cliente ?? null,
  status: r.estado,
  createdAt: r.creado_en,
  preparingAt: r.en_preparacion_en,
  readyAt: r.listo_en,
  pickedUpAt: r.retirado_en,
  cancelledAt: r.cancelado_en,
  seenAt: r.visto_en,
  qrToken: r.qr_token,
  hasPush: Boolean(r.avisos_activos),
  employee: r.empleados?.nombre ?? null,
});

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
    /* Ignorado en el servidor: la jornada sale de locales.hora_corte.
     * Se manda igual porque la firma de PostgREST no cambió. */
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

/* Pasa a `en_preparacion` los pedidos de la sucursal que ya cumplieron el
 * minuto. La regla vive en la base (ver pedidos-en-preparacion.sql); acá solo
 * se la dispara.
 *
 * No devuelve nada útil para la UI: el cambio de estado llega igual por el
 * realtime de `pedidos` y por el propio refresco. Si falla, se ignora — es
 * mantenimiento, no una acción del usuario, y el barrido del cron lo alcanza
 * igual más tarde. */
export const markInPreparation = async (branchId: string): Promise<void> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return;
  const { error } = await supabase.rpc("marcar_en_preparacion_local", {
    p_local: branchId,
  });
  if (error) console.error("markInPreparation", error.message);
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
  /* null/omit → crear_pedido asigna el próximo número de la jornada. */
  reference?: string | null;
  employeeId?: string | null;
}): Promise<OrderView | null> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return null;
  const v = parseInput(newOrderSchema, {
    ...args,
    reference: args.reference?.trim() ? args.reference.trim() : null,
  });
  if (!v.ok) {
    reportError("panel.pedidos.crear", v.error, { branchId: args.branchId });
    return null;
  }
  const { data, error } = await supabase.rpc("crear_pedido", {
    p_local: v.data.branchId,
    p_referencia: v.data.reference ?? null,
    p_empleado: v.data.employeeId ?? null,
    p_desde: startOfBusinessDay(),
    p_expira: endOfBusinessDay(),
  });
  if (error) {
    reportError("panel.pedidos.crear", error, { branchId: args.branchId });
    return null;
  }
  const res = data as {
    ok: boolean;
    reason?: string;
    pedido?: Row & { empleado_nombre?: string | null };
  };
  if (!res?.ok || !res.pedido) {
    reportError("panel.pedidos.crear", res?.reason ?? "crear_pedido falló", {
      branchId: args.branchId,
    });
    return null;
  }
  return mapRow({
    ...res.pedido,
    empleados: { nombre: res.pedido.empleado_nombre ?? null },
  });
};

/* ¿El cliente abrió el QR de este pedido, y cuándo?
 *
 * El panel cierra el modal cuando `visto_en` cambia respecto de cuando se
 * abrió el QR (alta nueva o “Ver QR”). Realtime a veces llega tarde o el
 * pedido no está en la página visible, así que con el modal abierto lo
 * consultamos en un intervalo corto. */
export const fetchOrderSeenAt = async (
  id: string,
): Promise<string | null> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("pedidos")
    .select("visto_en")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    reportError("panel.pedidos.visto", error, { orderId: id });
    return null;
  }
  return (data as { visto_en: string | null } | null)?.visto_en ?? null;
};

export const fetchOrderSeen = async (id: string): Promise<boolean> =>
  Boolean(await fetchOrderSeenAt(id));

export const updateOrderStatus = async (
  id: string,
  estado: OrderStatus,
): Promise<boolean> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return false;
  const desde = orderTransitionSources(estado);
  if (!desde.length) {
    reportWarning("panel.pedidos.estado", `sin origen válido hacia ${estado}`, {
      orderId: id,
    });
    return false;
  }
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { estado: estado };
  if (estado === "en_preparacion") patch.en_preparacion_en = now;
  else if (estado === "listo") {
    patch.listo_en = now;
    patch.avisado_en = now;
  } else if (estado === "retirado") patch.retirado_en = now;
  else if (estado === "cancelado") patch.cancelado_en = now;

  const { data, error } = await supabase
    .from("pedidos")
    .update(patch)
    .eq("id", id)
    .in("estado", desde)
    .select("id");
  if (error) {
    reportError("panel.pedidos.estado", error, { orderId: id });
    return false;
  }
  if (!data?.length) {
    reportWarning(
      "panel.pedidos.estado",
      `el pedido ${id} ya no estaba en ${desde.join("|")}, no se pasó a ${estado}`,
      { orderId: id },
    );
    return false;
  }
  return true;
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
