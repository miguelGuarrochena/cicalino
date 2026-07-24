"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import type { OrderStatus, OrderView } from "@/lib/types";

// ---------------------------------------------------------------------------
// Capa de datos de PEDIDOS contra Supabase (cliente del navegador, con RLS).
// Las columnas de la base están en castellano (base = "no se traduce"); acá
// mapeamos a OrderView (camelCase) para la UI.
// ---------------------------------------------------------------------------

// ¿El id de sucursal es real (UUID) o un id demo tipo "suc-centro"?
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isRealBranchId = (id: string | null): id is string =>
  !!id && UUID_RE.test(id);

// Fila cruda de la tabla `pedidos` (+ join opcional al empleado).
type Row = {
  id: string;
  referencia: string;
  estado: OrderStatus;
  creado_en: string;
  en_preparacion_en: string | null;
  listo_en: string | null;
  retirado_en: string | null;
  cancelado_en: string | null;
  qr_token: string;
  empleados?: { nombre: string | null } | null;
};

const mapRow = (r: Row): OrderView => ({
  id: r.id,
  referencia: r.referencia,
  estado: r.estado,
  creadoEn: r.creado_en,
  enPreparacionEn: r.en_preparacion_en,
  listoEn: r.listo_en,
  retiradoEn: r.retirado_en,
  canceladoEn: r.cancelado_en,
  qrToken: r.qr_token,
  empleado: r.empleados?.nombre ?? null,
});

const SELECT = "*, empleados(nombre)";

const inicioDelDia = (): string => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

const finDelDia = (): string => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
};

// Pedidos del día de una sucursal (más nuevos primero).
export const fetchTodayOrders = async (
  branchId: string,
): Promise<OrderView[]> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("pedidos")
    .select(SELECT)
    .eq("local_id", branchId)
    .gte("creado_en", inicioDelDia())
    .order("creado_en", { ascending: false });
  if (error) {
    console.error("fetchTodayOrders", error.message);
    return [];
  }
  return (data as unknown as Row[]).map(mapRow);
};

// Nombre de la sucursal (para el encabezado del panel).
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

// Crear un pedido. Devuelve el OrderView creado (con su qr_token) para el QR.
export const insertOrder = async (args: {
  branchId: string;
  reference: string;
  employeeId?: string | null;
}): Promise<OrderView | null> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("pedidos")
    .insert({
      local_id: args.branchId,
      referencia: args.reference,
      estado: "creado",
      empleado_id: args.employeeId ?? null,
      qr_token: crypto.randomUUID(),
      qr_expira_en: finDelDia(),
    })
    .select(SELECT)
    .single();
  if (error) {
    console.error("insertOrder", error.message);
    return null;
  }
  return mapRow(data as unknown as Row);
};

// Cambiar el estado, sellando el timestamp correspondiente.
export const updateOrderStatus = async (
  id: string,
  status: OrderStatus,
): Promise<void> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { estado: status };
  if (status === "en_preparacion") patch.en_preparacion_en = now;
  else if (status === "listo") patch.listo_en = now;
  else if (status === "retirado") patch.retirado_en = now;
  else if (status === "cancelado") patch.cancelado_en = now;
  const { error } = await supabase.from("pedidos").update(patch).eq("id", id);
  if (error) console.error("updateOrderStatus", error.message);
};

// Suscripción realtime a los pedidos de una sucursal (sync multi-caja).
// Llama onChange en cada INSERT/UPDATE/DELETE. Devuelve función de baja.
export const subscribeOrders = (
  branchId: string,
  onChange: () => void,
): (() => void) => {
  const supabase = createBrowserSupabase();
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`orders-${branchId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "pedidos",
        filter: `local_id=eq.${branchId}`,
      },
      () => onChange(),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
};
