"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import { businessDayStart, TZ_NEGOCIO } from "@/lib/businessDay";
import { useConfigStore } from "@/lib/store/config-store";
import {
  ejes,
  minutos,
  pico,
  porcentaje,
  tramos,
  type Bucket,
  type ChartLocale,
  type Periodo,
  type Tramo,
} from "@/lib/metricsChart";

export type { ChartLocale, Periodo, Tramo };

/* Sucursal sola, o todas las de la organización que el usuario puede ver.
 * Global lo resuelve Postgres en metricas_pedidos_org: acá no se suma nada. */
export type MetricsScope =
  | { alcance: "sucursal"; branchId: string }
  | { alcance: "global"; organizationId: string };

export interface MetricsData {
  pedidos: string;
  prep: string;
  retiro: string;
  cola: string;
  pico: string;
  avisos: string;
  labels: string[];
  valores: number[];
  /* Distribución de tiempos. Vacía cuando todavía no hay nada terminado. */
  tramos: Tramo[];
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
  tramos: [],
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
  tramos: Bucket[];
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
  fn: "metricas_pedidos" | "metricas_pedidos_org" | "metricas_espera",
  args: Record<string, string>,
  period: Periodo,
): Promise<{ resumen: Resumen; inicio: Date } | null> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return null;
  const inicio = desde(period);

  const { data, error } = await supabase.rpc(fn, {
    ...args,
    p_desde: inicio.toISOString(),
    p_periodo: period,
    p_tz: TZ_NEGOCIO,
  });

  if (error || !data) {
    console.error(fn, error?.message);
    return null;
  }
  const resumen = data as unknown as Resumen;
  return {
    resumen: {
      ...resumen,
      buckets: resumen.buckets ?? [],
      tramos: resumen.tramos ?? [],
    },
    inicio,
  };
};

export const fetchMetrics = async (
  scope: MetricsScope,
  period: Periodo,
  locale: ChartLocale = "es",
): Promise<MetricsData> => {
  const res =
    scope.alcance === "global"
      ? await llamar(
          "metricas_pedidos_org",
          { p_organizacion: scope.organizationId },
          period,
        )
      : await llamar("metricas_pedidos", { p_local: scope.branchId }, period);
  if (!res) return VACIO;
  const { resumen, inicio } = res;
  const { labels, valores } = ejes(resumen.buckets, period, inicio, locale);

  return {
    pedidos: resumen.total.toLocaleString("es-AR"),
    prep: minutos(resumen.prepMin),
    retiro: minutos(resumen.retiroMin),
    cola: period === "dia" ? String(resumen.enCurso) : "—",
    pico: pico(labels, valores),
    avisos: porcentaje(resumen.avisados, resumen.total),
    labels,
    valores,
    tramos: tramos(resumen.tramos),
  };
};

export const fetchWaitlistMetrics = async (
  branchId: string,
  period: Periodo,
  locale: ChartLocale = "es",
): Promise<MetricsData> => {
  const res = await llamar("metricas_espera", { p_local: branchId }, period);
  if (!res) return VACIO;
  const { resumen, inicio } = res;
  const { labels, valores } = ejes(resumen.buckets, period, inicio, locale);

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
    tramos: tramos(resumen.tramos),
  };
};
