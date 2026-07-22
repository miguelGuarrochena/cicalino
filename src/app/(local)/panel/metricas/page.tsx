"use client";

import { useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useSessionStore } from "@/lib/store/session-store";
import { SinAcceso } from "@/components/ui/SinAcceso";

type Periodo = "dia" | "semana" | "mes" | "ano";

interface Datos {
  pedidos: string;
  prep: string;
  retiro: string;
  cola: string;
  pico: string;
  avisos: string;
  labels: string[];
  valores: number[];
}

const DATA: Record<Periodo, Datos> = {
  dia: {
    pedidos: "65", prep: "7 min", retiro: "2.5 min", cola: "3", pico: "13 h", avisos: "88%",
    labels: ["8h", "9h", "10h", "11h", "12h", "13h", "14h"],
    valores: [4, 9, 7, 12, 18, 15, 10],
  },
  semana: {
    pedidos: "412", prep: "8 min", retiro: "2.8 min", cola: "—", pico: "Sáb", avisos: "86%",
    labels: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
    valores: [48, 52, 55, 61, 78, 84, 34],
  },
  mes: {
    pedidos: "1.720", prep: "8 min", retiro: "3 min", cola: "—", pico: "Sem 4", avisos: "85%",
    labels: ["Sem 1", "Sem 2", "Sem 3", "Sem 4"],
    valores: [390, 412, 448, 470],
  },
  ano: {
    pedidos: "19.800", prep: "8 min", retiro: "3 min", cola: "—", pico: "Dic", avisos: "84%",
    labels: ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"],
    valores: [1200, 1150, 1400, 1500, 1600, 1700, 1750, 1720, 1650, 1800, 1900, 2430],
  },
};

const Tarjeta = ({ titulo, valor, detalle, delay, acento }: {
  titulo: string; valor: string; detalle: string; delay: number; acento?: boolean;
}) => {
  return (
    <div className="u-in rounded-[24px] border border-linea bg-surface p-5 shadow-sm" style={{ animationDelay: `${delay}s` }}>
      <p className="text-sm text-carbon/55">{titulo}</p>
      <p className={`mt-2 font-display text-3xl uppercase tracking-tight sm:text-4xl ${acento ? "text-emerald-600" : "text-marca"}`}>
        {valor}
      </p>
      <p className="mt-1 text-xs text-carbon/45">{detalle}</p>
    </div>
  );
};

const MetricasPage = () => {
  const { t } = useApp();
  const rol = useSessionStore((s) => s.rol);
  const [periodo, setPeriodo] = useState<Periodo>("dia");

  if (rol !== "admin") return <SinAcceso />;

  const d = DATA[periodo];
  const max = Math.max(...d.valores);
  const tiempos = [
    { rango: "0-5", pct: 34 },
    { rango: "5-10", pct: 41 },
    { rango: "10-15", pct: 18 },
    { rango: "15+", pct: 7 },
  ];
  const periodos: Periodo[] = ["dia", "semana", "mes", "ano"];

  return (
    <div className="flex flex-col gap-6">
      <div className="u-in flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl uppercase tracking-tight text-carbon sm:text-4xl">
          {t("metricas.titulo")}
        </h1>
        <div className="flex rounded-full border border-linea bg-surface p-1">
          {periodos.map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition sm:px-4 ${
                periodo === p ? "bg-marca text-crema" : "text-carbon/55 hover:text-carbon"
              }`}
            >
              {t(`metricas.periodo.${p}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <Tarjeta titulo={t("metricas.pedidos")} valor={d.pedidos} detalle={t("metricas.pedidosDet")} delay={0.05} />
        <Tarjeta titulo={t("metricas.prep")} valor={d.prep} detalle={t("metricas.prepDet")} delay={0.1} />
        <Tarjeta titulo={t("metricas.retiro")} valor={d.retiro} detalle={t("metricas.retiroDet")} delay={0.15} />
        <Tarjeta titulo={t("metricas.cola")} valor={d.cola} detalle={t("metricas.colaDet")} delay={0.2} />
        <Tarjeta titulo={t("metricas.pico")} valor={d.pico} detalle={t("metricas.picoDet")} delay={0.25} />
        <Tarjeta titulo={t("metricas.avisos")} valor={d.avisos} detalle={t("metricas.avisosDet")} delay={0.3} acento />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="u-in rounded-[24px] border border-linea bg-surface p-6 shadow-sm lg:col-span-3" style={{ animationDelay: "0.35s" }}>
          <p className="mb-5 text-sm font-medium text-carbon/70">{t("metricas.volumen")}</p>
          <div className="flex items-end gap-1.5 sm:gap-2" style={{ height: 180 }}>
            {d.valores.map((v, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <div className="w-full rounded-t-lg bg-marca/85 transition-all duration-500 hover:bg-marca" style={{ height: `${(v / max) * 140}px` }} title={`${v}`} />
                <span className="text-[10px] text-carbon/45 sm:text-xs">{d.labels[i]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="u-in rounded-[24px] border border-linea bg-surface p-6 shadow-sm lg:col-span-2" style={{ animationDelay: "0.42s" }}>
          <p className="mb-5 text-sm font-medium text-carbon/70">{t("metricas.tiempos")}</p>
          <div className="flex flex-col gap-3">
            {tiempos.map((r) => (
              <div key={r.rango} className="flex items-center gap-3">
                <span className="w-12 text-xs text-carbon/50">{r.rango}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-carbon/8">
                  <div className="h-full rounded-full bg-emerald-500/80 transition-all duration-700" style={{ width: `${r.pct}%` }} />
                </div>
                <span className="w-9 text-right text-xs font-semibold text-carbon/60">{r.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
export default MetricasPage;
