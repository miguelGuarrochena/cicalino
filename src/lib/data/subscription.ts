"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import type { SubscriptionStatus } from "@/lib/subscription";
import type { BillingPlan } from "@/lib/billing";

export interface MySubscription {
  status: SubscriptionStatus;
  plan: BillingPlan;
  activo: boolean;
  /* Null = la cuenta nunca llegó a activarse. `activo: false` significa dos
   * cosas distintas —pausada a mano, o alta sin terminar— y sin esto no se
   * pueden separar. */
  contratoAceptadoEn: string | null;
  altaEn: string | null;
  pruebaInicio: string | null;
  pruebaFin: string | null;
  proximaFactura: string | null;
  ultimoPagoEn: string | null;
}

type Row = {
  plan: string | null;
  estado_suscripcion: string | null;
  activo: boolean | null;
  contrato_aceptado_en: string | null;
  creado_en: string | null;
  prueba_inicio: string | null;
  prueba_fin: string | null;
  proxima_factura: string | null;
  ultimo_pago_en: string | null;
};

/* Can this account still write?
 *
 * Mirrors `local_operativo` in supabase/corte-por-impago.sql, which is what
 * actually enforces it. This copy only drives the UI: without it the panel
 * would look normal and every action would fail with an RLS error and no
 * explanation. */
export const puedeOperar = (s: MySubscription): boolean =>
  s.activo && s.status !== "expired";

/* Por qué no puede operar. Importa para el cartel: "pausada" es una decisión
 * que alguien tomó, y "sin activar" es un alta que quedó por la mitad. Decirle
 * "pausada" a la segunda contradice lo que muestra el panel de Superadmin, que
 * la lista como prueba gratuita en curso. */
export type MotivoBloqueo = "vencida" | "pausada" | "sin-activar";

export const motivoBloqueo = (s: MySubscription): MotivoBloqueo => {
  if (s.status === "expired") return "vencida";
  if (!s.contratoAceptadoEn) return "sin-activar";
  return "pausada";
};

export const fetchMySubscription = async (
  orgId: string,
): Promise<MySubscription | null> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("organizaciones")
    .select(
      "plan, estado_suscripcion, activo, contrato_aceptado_en, creado_en, prueba_inicio, prueba_fin, proxima_factura, ultimo_pago_en",
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
    activo: r.activo !== false,
    contratoAceptadoEn: r.contrato_aceptado_en,
    altaEn: r.creado_en,
    pruebaInicio: r.prueba_inicio,
    pruebaFin: r.prueba_fin,
    proximaFactura: r.proxima_factura,
    ultimoPagoEn: r.ultimo_pago_en,
  };
};
