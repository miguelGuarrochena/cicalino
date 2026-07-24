"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import { inicioJornada } from "@/lib/businessDay";
import { useConfigStore } from "@/lib/store/config-store";

export type Periodo = "dia" | "semana" | "mes" | "ano";

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

type Row = {
  estado: string;
  creado_en: string;
  listo_en: string | null;
  retirado_en: string | null;
};

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

const desde = (period: Periodo): Date => {
  if (period === "dia") return inicioJornada(useConfigStore.getState().horaCorte);
  const d = new Date();
  if (period === "semana") d.setDate(d.getDate() - 6);
  else if (period === "mes") d.setDate(d.getDate() - 29);
  else d.setMonth(d.getMonth() - 11);
  return d;
};

const minutosProm = (
  rows: Row[],
  a: (r: Row) => string | null,
  b: (r: Row) => string | null,
): string => {
  const difs = rows
    .map((r) => {
      const x = a(r);
      const y = b(r);
      if (!x || !y) return null;
      return (new Date(y).getTime() - new Date(x).getTime()) / 60000;
    })
    .filter((v): v is number => v != null && v >= 0);
  if (!difs.length) return "—";
  const avg = difs.reduce((s, v) => s + v, 0) / difs.length;
  return `${avg.toFixed(1)} min`;
};

const buckets = (
  rows: Row[],
  period: Periodo,
): { labels: string[]; valores: number[]; pico: string } => {
  if (period === "ano") {
    const now = new Date();
    const labels: string[] = [];
    const valores: number[] = [];
    for (let i = 11; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(MESES[m.getMonth()]);
      valores.push(
        rows.filter((r) => {
          const d = new Date(r.creado_en);
          return (
            d.getMonth() === m.getMonth() &&
            d.getFullYear() === m.getFullYear()
          );
        }).length,
      );
    }
    return { labels, valores, pico: pico(labels, valores) };
  }
  if (period === "mes") {
    const labels = ["Sem 1", "Sem 2", "Sem 3", "Sem 4"];
    const valores = [0, 0, 0, 0];
    const start = desde("mes").getTime();
    rows.forEach((r) => {
      const idx = Math.min(
        3,
        Math.floor((new Date(r.creado_en).getTime() - start) / (7 * 86400000)),
      );
      if (idx >= 0) valores[idx]++;
    });
    return { labels, valores, pico: pico(labels, valores) };
  }
  if (period === "semana") {
    const now = new Date();
    const labels: string[] = [];
    const valores: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      labels.push(DIAS[d.getDay()]);
      valores.push(
        rows.filter((r) => {
          const rd = new Date(r.creado_en);
          return rd.toDateString() === d.toDateString();
        }).length,
      );
    }
    return { labels, valores, pico: pico(labels, valores) };
  }
  // dia: por hora, ventana de horas con actividad
  const porHora = new Array(24).fill(0) as number[];
  rows.forEach((r) => porHora[new Date(r.creado_en).getHours()]++);
  let min = 8;
  let max = 20;
  const activas = porHora.map((v, h) => (v > 0 ? h : -1)).filter((h) => h >= 0);
  if (activas.length) {
    min = Math.min(min, activas[0]);
    max = Math.max(max, activas[activas.length - 1]);
  }
  const labels: string[] = [];
  const valores: number[] = [];
  for (let h = min; h <= max; h++) {
    labels.push(`${h}h`);
    valores.push(porHora[h]);
  }
  return { labels, valores, pico: pico(labels, valores) };
};

const pico = (labels: string[], valores: number[]): string => {
  if (!valores.length) return "—";
  let bi = 0;
  valores.forEach((v, i) => {
    if (v > valores[bi]) bi = i;
  });
  return valores[bi] > 0 ? labels[bi] : "—";
};

export const fetchMetrics = async (
  branchId: string,
  period: Periodo,
): Promise<MetricsData> => {
  const supabase = createBrowserSupabase();
  const vacio: MetricsData = {
    pedidos: "0",
    prep: "—",
    retiro: "—",
    cola: "0",
    pico: "—",
    avisos: "—",
    labels: [],
    valores: [],
  };
  if (!supabase) return vacio;
  const { data, error } = await supabase
    .from("pedidos")
    .select("estado, creado_en, listo_en, retirado_en")
    .eq("local_id", branchId)
    .gte("creado_en", desde(period).toISOString());
  if (error || !data) return vacio;
  const rows = data as Row[];
  const total = rows.length;
  const avisados = rows.filter(
    (r) => r.estado === "listo" || r.estado === "retirado",
  ).length;
  const enCurso = rows.filter((r) => r.estado === "creado").length;
  const { labels, valores, pico: pk } = buckets(rows, period);
  return {
    pedidos: total.toLocaleString("es-AR"),
    prep: minutosProm(
      rows,
      (r) => r.creado_en,
      (r) => r.listo_en,
    ),
    retiro: minutosProm(
      rows,
      (r) => r.listo_en,
      (r) => r.retirado_en,
    ),
    cola: period === "dia" ? String(enCurso) : "—",
    pico: pk,
    avisos: total ? `${Math.round((avisados / total) * 100)}%` : "—",
    labels,
    valores,
  };
};
