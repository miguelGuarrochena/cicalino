"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import { registerPayment, type SubscriptionState } from "@/lib/subscription";

export interface PaymentDetail {
  sucursalId: string;
  nombre: string;
  pack: string;
  monto: number;
}

export interface PaymentRow {
  id: string;
  fecha: string;
  monto: number;
  periodoDesde: string;
  periodoHasta: string;
  medio: string | null;
  nota: string | null;
  detalle: PaymentDetail[];
}

type Db = {
  id: string;
  fecha: string;
  monto: number;
  periodo_desde: string;
  periodo_hasta: string;
  medio: string | null;
  nota: string | null;
  detalle: PaymentDetail[] | null;
};

export const fetchPayments = async (orgId: string): Promise<PaymentRow[]> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("pagos")
    .select("id, fecha, monto, periodo_desde, periodo_hasta, medio, nota, detalle")
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
    detalle: ((r.detalle ?? []) as unknown as {
      sucursal_id: string;
      nombre: string;
      pack: string;
      monto: number;
    }[]).map((d) => ({
      sucursalId: d.sucursal_id,
      nombre: d.nombre,
      pack: d.pack,
      monto: d.monto,
    })),
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
  detalle?: PaymentDetail[];
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
    detalle: (args.detalle ?? []).map((d) => ({
      sucursal_id: d.sucursalId,
      nombre: d.nombre,
      pack: d.pack,
      monto: d.monto,
    })),
  });
  if (errPago) {
    console.error("savePayment", errPago.message);
    return { ok: false, error: "No se pudo guardar el pago." };
  }

  const { error: errOrg } = await supabase
    .from("organizaciones")
    .update({
      proxima_factura: next.nextBilling,
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

export interface SentEmailRow {
  id: string;
  tipo: string;
  asunto: string;
  destinatario: string;
  aceptado: boolean;
  error: string | null;
  creadoEn: string;
}

export const fetchSentEmails = async (
  orgId: string,
): Promise<SentEmailRow[]> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("emails_enviados")
    .select("id, tipo, asunto, destinatario, aceptado, error, creado_en")
    .eq("organizacion_id", orgId)
    .order("creado_en", { ascending: false })
    .limit(20);
  if (error) {
    console.error("fetchSentEmails", error.message);
    return [];
  }
  return (
    (data as {
      id: string;
      tipo: string;
      asunto: string;
      destinatario: string;
      aceptado: boolean;
      error: string | null;
      creado_en: string;
    }[] | null) ?? []
  ).map((r) => ({
    id: r.id,
    tipo: r.tipo,
    asunto: r.asunto,
    destinatario: r.destinatario,
    aceptado: r.aceptado,
    error: r.error,
    creadoEn: r.creado_en,
  }));
};
