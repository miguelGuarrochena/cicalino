"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import { businessDayStart, TZ_NEGOCIO } from "@/lib/businessDay";
import { useConfigStore } from "@/lib/store/config-store";
import {
  ejes,
  minutos,
  pico,
  porcentaje,
  type Bucket,
  type Periodo,
} from "@/lib/metricsChart";

export type { Periodo };

export interface MetricsData {
  pedidos: string;
  prep: string;
  retiro: string;
  cola: string;
  pico: string;
  avisos: string;
  labels: string[];
  valores: number[];
}

const VACIO: MetricsData = {
  pedidos: "0",
  prep: "—",
  retiro: "—",
  cola: "0",
  pico: "—",
  avisos: "—",
  labels: [],
  valores: [],
};

/* Lo que devuelve la RPC. La agregación entera la hace Postgres. */
interface Resumen {
  total: number;
  avisados: number;
  enCurso: number;
  prepMin: number | null;
  retiroMin?: number | null;
  mesasTotal?: number;
  mesasOcupadas?: number;
  buckets: Bucket[];
}

const desde = (period: Periodo): Date => {
  if (period === "dia") {
    return businessDayStart(useConfigStore.getState().cutoffHour);
  }
  const d = new Date();
  if (period === "semana") d.setDate(d.getDate() - 6);
  else if (period === "mes") d.setDate(d.getDate() - 29);
  else d.setMonth(d.getMonth() - 11);
  return d;
};

const llamar = async (
  fn: "metricas_pedidos" | "metricas_espera",
  branchId: string,
  period: Periodo,
): Promise<{ resumen: Resumen; inicio: Date } | null> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return null;
  const inicio = desde(period);

  const { data, error } = await supabase.rpc(fn, {
    p_local: branchId,
    p_desde: inicio.toISOString(),
    p_periodo: period,
    p_tz: TZ_NEGOCIO,
  });

  if (error || !data) {
    console.error(fn, error?.message);
    return null;
  }
  const resumen = data as unknown as Resumen;
  return { resumen: { ...resumen, buckets: resumen.buckets ?? [] }, inicio };
};

export const fetchMetrics = async (
  branchId: string,
  period: Periodo,
): Promise<MetricsData> => {
  const res = await llamar("metricas_pedidos", branchId, period);
  if (!res) return VACIO;
  const { resumen, inicio } = res;
  const { labels, valores } = ejes(resumen.buckets, period, inicio);

  return {
    pedidos: resumen.total.toLocaleString("es-AR"),
    prep: minutos(resumen.prepMin),
    retiro: minutos(resumen.retiroMin),
    cola: period === "dia" ? String(resumen.enCurso) : "—",
    pico: pico(labels, valores),
    avisos: porcentaje(resumen.avisados, resumen.total),
    labels,
    valores,
  };
};

export const fetchWaitlistMetrics = async (
  branchId: string,
  period: Periodo,
): Promise<MetricsData> => {
  const res = await llamar("metricas_espera", branchId, period);
  if (!res) return VACIO;
  const { resumen, inicio } = res;
  const { labels, valores } = ejes(resumen.buckets, period, inicio);

  const mesasTotal = resumen.mesasTotal ?? 0;
  const ocupacion =
    mesasTotal > 0
      ? porcentaje(resumen.mesasOcupadas ?? 0, mesasTotal)
      : "—";

  return {
    pedidos: resumen.total.toLocaleString("es-AR"),
    prep: minutos(resumen.prepMin),
    retiro: ocupacion,
    cola: period === "dia" ? String(resumen.enCurso) : "—",
    pico: pico(labels, valores),
    avisos: porcentaje(resumen.avisados, resumen.total),
    labels,
    valores,
  };
};
