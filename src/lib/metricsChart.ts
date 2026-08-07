/* Armado del eje del gráfico de métricas.
 *
 * La agregación la hace Postgres y devuelve solo los buckets con datos, como
 * pares {k: índice, n: cantidad}. Acá se despliegan al eje completo del
 * período, con ceros donde no hubo movimiento.
 *
 * Va separado de data/metrics.ts para que sea puro y testeable: ese módulo es
 * "use client" y arrastra el cliente de Supabase y el store de config.
 */

export type Periodo = "dia" | "semana" | "mes" | "ano";

export interface Bucket {
  k: number;
  n: number;
}

export interface Ejes {
  labels: string[];
  valores: number[];
}

export const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const MESES = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/* El eje por hora siempre cubre al menos esta franja, aunque no haya datos:
 * un gráfico que arranca a las 14 porque fue el primer pedido del día se lee
 * peor que uno con la jornada completa. */
const HORA_MIN = 8;
const HORA_MAX = 20;

export const minutos = (v: number | null | undefined): string =>
  v == null ? "—" : `${v.toFixed(1)} min`;

export const porcentaje = (parte: number, total: number): string =>
  total > 0 ? `${Math.round((parte / total) * 100)}%` : "—";

export const pico = (labels: string[], valores: number[]): string => {
  if (!valores.length) return "—";
  let bi = 0;
  valores.forEach((v, i) => {
    if (v > valores[bi]) bi = i;
  });
  return valores[bi] > 0 ? labels[bi] : "—";
};

export const ejes = (
  buckets: Bucket[],
  period: Periodo,
  inicio: Date,
): Ejes => {
  const mapa = new Map(buckets.map((b) => [b.k, b.n]));
  const cantidad = (k: number) => mapa.get(k) ?? 0;

  if (period === "ano") {
    const labels: string[] = [];
    const valores: number[] = [];
    for (let i = 0; i < 12; i++) {
      const m = new Date(inicio.getFullYear(), inicio.getMonth() + i, 1);
      labels.push(MESES[m.getMonth()]);
      valores.push(cantidad(i));
    }
    return { labels, valores };
  }

  if (period === "mes") {
    return {
      labels: ["Sem 1", "Sem 2", "Sem 3", "Sem 4"],
      valores: [0, 1, 2, 3].map(cantidad),
    };
  }

  if (period === "semana") {
    const labels: string[] = [];
    const valores: number[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      labels.push(DIAS[d.getDay()]);
      valores.push(cantidad(i));
    }
    return { labels, valores };
  }

  const horasConDatos = buckets.filter((b) => b.n > 0).map((b) => b.k);
  const min = Math.min(HORA_MIN, ...horasConDatos);
  const max = Math.max(HORA_MAX, ...horasConDatos);
  const labels: string[] = [];
  const valores: number[] = [];
  for (let h = min; h <= max; h++) {
    labels.push(`${h}h`);
    valores.push(cantidad(h));
  }
  return { labels, valores };
};
