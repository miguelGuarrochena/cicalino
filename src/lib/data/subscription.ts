"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import type { SubscriptionStatus } from "@/lib/subscription";
import type { BillingPlan } from "@/lib/billing";

export interface MySubscription {
  status: SubscriptionStatus;
  plan: BillingPlan;
  altaEn: string | null;
  pruebaInicio: string | null;
  pruebaFin: string | null;
  proximaFactura: string | null;
  ultimoPagoEn: string | null;
}

type Row = {
  plan: string | null;
  estado_suscripcion: string | null;
  creado_en: string | null;
  prueba_inicio: string | null;
  prueba_fin: string | null;
  proxima_factura: string | null;
  ultimo_pago_en: string | null;
};

export const fetchMySubscription = async (
  orgId: string,
): Promise<MySubscription | null> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("organizaciones")
    .select(
      "plan, estado_suscripcion, creado_en, prueba_inicio, prueba_fin, proxima_factura, ultimo_pago_en",
    )
    .eq("id", orgId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("fetchMySubscription", error.message);
    return null;
  }
  const r = data as Row;
  return {
    status: (r.estado_suscripcion as SubscriptionStatus) ?? "active",
    plan: (r.plan as BillingPlan) ?? "mensual",
    altaEn: r.creado_en,
    pruebaInicio: r.prueba_inicio,
    pruebaFin: r.prueba_fin,
    proximaFactura: r.proxima_factura,
    ultimoPagoEn: r.ultimo_pago_en,
  };
};
