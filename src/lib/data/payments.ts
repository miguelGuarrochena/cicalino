"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import { registerPayment, type SubscriptionState } from "@/lib/subscription";

export interface PaymentRow {
  id: string;
  fecha: string;
  monto: number;
  periodoDesde: string;
  periodoHasta: string;
  medio: string | null;
  nota: string | null;
}

type Db = {
  id: string;
  fecha: string;
  monto: number;
  periodo_desde: string;
  periodo_hasta: string;
  medio: string | null;
  nota: string | null;
};

export const fetchPayments = async (orgId: string): Promise<PaymentRow[]> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("pagos")
    .select("id, fecha, monto, periodo_desde, periodo_hasta, medio, nota")
    .eq("organizacion_id", orgId)
    .order("fecha", { ascending: false });
  if (error) {
    console.error("fetchPayments", error.message);
    return [];
  }
  return ((data as Db[] | null) ?? []).map((r) => ({
    id: r.id,
    fecha: r.fecha,
    monto: r.monto,
    periodoDesde: r.periodo_desde,
    periodoHasta: r.periodo_hasta,
    medio: r.medio,
    nota: r.nota,
  }));
};

export const savePayment = async (args: {
  orgId: string;
  state: SubscriptionState;
  cycleDay: number;
  cycles: number;
  fecha: string;
  monto: number;
  medio?: string;
  nota?: string;
}): Promise<{ ok: boolean; nextBilling?: string; error?: string }> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return { ok: false, error: "Sin conexión." };

  const next = registerPayment(args.state, args.cycleDay, args.cycles);

  const { error: errPago } = await supabase.from("pagos").insert({
    organizacion_id: args.orgId,
    fecha: args.fecha,
    monto: Math.max(0, Math.round(args.monto)),
    periodo_desde: next.periodFrom,
    periodo_hasta: next.periodTo,
    medio: args.medio?.trim() || null,
    nota: args.nota?.trim() || null,
  });
  if (errPago) {
    console.error("savePayment", errPago.message);
    return { ok: false, error: "No se pudo guardar el pago." };
  }

  const { error: errOrg } = await supabase
    .from("organizaciones")
    .update({
      proxima_factura: next.nextBilling,
      proximo_cobro_en: next.nextBilling,
      ultimo_pago_en: args.fecha,
      estado_suscripcion: "active",
      pagado: true,
      activo: true,
    })
    .eq("id", args.orgId);
  if (errOrg) {
    console.error("savePayment/org", errOrg.message);
    return { ok: false, error: "El pago quedó guardado pero no se actualizó el ciclo." };
  }

  return { ok: true, nextBilling: next.nextBilling };
};
