"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useSessionStore } from "@/lib/store/session-store";
import {
  orgById,
  useSuperadminStore,
} from "@/lib/store/superadmin-store";
import { NoAccess } from "@/components/ui/NoAccess";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { isRealBranchId } from "@/lib/data/orders";
import { fetchMetrics, fetchEsperaMetrics, type MetricsData } from "@/lib/data/metrics";
import { useConfigStore } from "@/lib/store/config-store";

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

const DATA_ESPERA: Record<Periodo, Datos> = {
  dia: {
    pedidos: "28", prep: "14 min", retiro: "—", cola: "5", pico: "21 h", avisos: "91%",
    labels: ["8h", "9h", "10h", "11h", "12h", "13h", "14h"],
    valores: [1, 3, 4, 5, 7, 5, 3],
  },
  semana: {
    pedidos: "162", prep: "12 min", retiro: "—", cola: "—", pico: "Vie", avisos: "89%",
    labels: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
    valores: [18, 20, 22, 24, 32, 30, 16],
  },
  mes: {
    pedidos: "680", prep: "13 min", retiro: "—", cola: "—", pico: "Sem 3", avisos: "88%",
    labels: ["Sem 1", "Sem 2", "Sem 3", "Sem 4"],
    valores: [150, 165, 190, 175],
  },
  ano: {
    pedidos: "7.400", prep: "13 min", retiro: "—", cola: "—", pico: "Dic", avisos: "87%",
    labels: ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"],
    valores: [500, 480, 520, 580, 620, 640, 660, 650, 610, 700, 720, 720],
  },
};

const Tarjeta = ({ titulo, valor, detalle, delay, acento, acentoColor = "marca" }: {
  titulo: string; valor: string; detalle: string; delay: number; acento?: boolean;
  acentoColor?: "marca" | "espera";
}) => {
  const color =
    acento
      ? "text-emerald-600"
      : acentoColor === "espera"
        ? "text-espera"
        : "text-marca";
  return (
    <div className="u-in rounded-[24px] border border-linea bg-surface p-5 shadow-sm" style={{ animationDelay: `${delay}s` }}>
      <p className="text-sm text-carbon/55">{titulo}</p>
      <p className={`mt-2 font-display text-3xl uppercase tracking-tight sm:text-4xl ${color}`}>
        {valor}
      </p>
      <p className="mt-1 text-xs text-carbon/45">{detalle}</p>
    </div>
  );
};

const MetricasPage = () => {
  const { t } = useApp();
  const role = useSessionStore((s) => s.rol);
  const branchId = useSessionStore((s) => s.sucursalId);
  const orgs = useSuperadminStore((s) => s.organizaciones);
  const moduloPedidos = useConfigStore((s) => s.moduloPedidos);
  const moduloEspera = useConfigStore((s) => s.moduloEspera);
  const [periodo, setPeriodo] = useState<Periodo>("dia");
  const [alcance, setAlcance] = useState<"sucursal" | "global">("sucursal");
  const [tab, setTab] = useState<"pedidos" | "espera">(
    moduloPedidos ? "pedidos" : "espera",
  );

  const live = supabaseConfigurado && isRealBranchId(branchId);
  const [liveData, setLiveData] = useState<MetricsData | null>(null);
  const [liveEspera, setLiveEspera] = useState<MetricsData | null>(null);
  useEffect(() => {
    if (!live || !branchId) {
      setLiveData(null);
      setLiveEspera(null);
      return;
    }
    let active = true;
    void fetchMetrics(branchId, periodo).then((m) => {
      if (active) setLiveData(m);
    });
    void fetchEsperaMetrics(branchId, periodo).then((m) => {
      if (active) setLiveEspera(m);
    });
    return () => {
      active = false;
    };
  }, [live, branchId, periodo]);

  if (role !== "admin") return <NoAccess />;

  const org = orgById(orgs, useSessionStore.getState().organizacionId);
  const suc = org?.sucursales.find((s) => s.id === branchId);
  const multi = (org?.sucursales.filter((s) => s.activo).length ?? 0) > 1;

  const EMPTY: MetricsData = {
    pedidos: "…",
    prep: "—",
    retiro: "—",
    cola: "—",
    pico: "—",
    avisos: "—",
    labels: [],
    valores: [],
  };
  const d =
    tab === "espera"
      ? live
        ? liveEspera ?? EMPTY
        : DATA_ESPERA[periodo]
      : live
        ? liveData ?? EMPTY
        : DATA[periodo];
  // En live el alcance es por sucursal (sin multiplicador demo).
  const factor = !live && tab === "pedidos" && alcance === "global" && multi ? 1.7 : 1;
  const ordersNum = Math.round(
    Number(d.pedidos.replace(/\./g, "").replace(",", ".")) * factor,
  );
  const ordersDisplay = Number.isFinite(ordersNum)
    ? ordersNum.toLocaleString("es-AR")
    : d.pedidos;
  const max = Math.max(1, ...d.valores.map((v) => Math.round(v * factor)));
  const valores = d.valores.map((v) => Math.round(v * factor));
  const tiempos = [
    { rango: "0-5", pct: tab === "espera" ? 22 : 34 },
    { rango: "5-10", pct: tab === "espera" ? 28 : 41 },
    { rango: "10-15", pct: tab === "espera" ? 30 : 18 },
    { rango: "15+", pct: tab === "espera" ? 20 : 7 },
  ];
  const periodos: Periodo[] = ["dia", "semana", "mes", "ano"];
  const showTabs = moduloPedidos && moduloEspera;
  const accent = tab === "espera" ? "espera" : "marca";

  return (
    <div className="flex flex-col gap-6">
      {showTabs && (
        <div
          className="flex rounded-2xl border border-linea bg-surface p-1 shadow-sm"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "pedidos"}
            onClick={() => setTab("pedidos")}
            className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
              tab === "pedidos"
                ? "bg-marca text-crema"
                : "text-carbon/55 hover:bg-carbon/5"
            }`}
          >
            Pedidos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "espera"}
            onClick={() => setTab("espera")}
            className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
              tab === "espera"
                ? "bg-espera text-crema"
                : "text-carbon/55 hover:bg-carbon/5"
            }`}
          >
            Espera de mesa
          </button>
        </div>
      )}

      <div className="u-in flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-tight text-carbon sm:text-4xl">
            {t("metricas.titulo")}
            {tab === "espera" ? " · Espera" : ""}
          </h1>
          <p className="mt-1 text-sm text-carbon/50">
            {alcance === "global"
              ? t("metricas.alcanceGlobal")
              : `${t("metricas.alcanceSucursal")}${suc ? ` · ${suc.nombre}` : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {multi && tab === "pedidos" && (
            <div className="flex rounded-full border border-linea bg-surface p-1">
              {(
                [
                  ["sucursal", "metricas.alcanceSucursal"],
                  ["global", "metricas.alcanceGlobal"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setAlcance(k)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    alcance === k
                      ? "bg-marca text-crema"
                      : "text-carbon/55 hover:text-carbon"
                  }`}
                >
                  {t(label)}
                </button>
              ))}
            </div>
          )}
          <div className="flex rounded-full border border-linea bg-surface p-1">
            {periodos.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriodo(p)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition sm:px-4 ${
                  periodo === p
                    ? accent === "espera"
                      ? "bg-espera text-crema"
                      : "bg-marca text-crema"
                    : "text-carbon/55 hover:text-carbon"
                }`}
              >
                {t(`metricas.periodo.${p}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <Tarjeta
          titulo={tab === "espera" ? "Grupos" : t("metricas.pedidos")}
          valor={ordersDisplay}
          detalle={
            tab === "espera"
              ? "Grupos en la cola / sentados"
              : t("metricas.pedidosDet")
          }
          delay={0.05}
          acentoColor={accent}
        />
        <Tarjeta
          titulo={tab === "espera" ? "Espera media" : t("metricas.prep")}
          valor={d.prep}
          detalle={
            tab === "espera"
              ? "Hasta el aviso de mesa"
              : t("metricas.prepDet")
          }
          delay={0.1}
          acentoColor={accent}
        />
        <Tarjeta
          titulo={tab === "espera" ? "Ocupación" : t("metricas.retiro")}
          valor={d.retiro}
          detalle={
            tab === "espera"
              ? "Mesas ocupadas ahora"
              : t("metricas.retiroDet")
          }
          delay={0.15}
          acentoColor={accent}
        />
        <Tarjeta
          titulo={tab === "espera" ? "En cola ahora" : t("metricas.cola")}
          valor={d.cola}
          detalle={
            tab === "espera" ? "Grupos esperando" : t("metricas.colaDet")
          }
          delay={0.2}
          acentoColor={accent}
        />
        <Tarjeta
          titulo={t("metricas.pico")}
          valor={d.pico}
          detalle={t("metricas.picoDet")}
          delay={0.25}
          acentoColor={accent}
        />
        <Tarjeta
          titulo={tab === "espera" ? "% avisados" : t("metricas.avisos")}
          valor={d.avisos}
          detalle={
            tab === "espera"
              ? "Grupos notificados a tiempo"
              : t("metricas.avisosDet")
          }
          delay={0.3}
          acento
          acentoColor={accent}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="u-in rounded-[24px] border border-linea bg-surface p-6 shadow-sm lg:col-span-3" style={{ animationDelay: "0.35s" }}>
          <p className="mb-5 text-sm font-medium text-carbon/70">
            {tab === "espera" ? "Volumen de grupos" : t("metricas.volumen")}
          </p>
          <div className="flex items-end gap-1.5 sm:gap-2" style={{ height: 180 }}>
            {valores.map((v, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className={`w-full rounded-t-lg transition-all duration-500 ${
                    accent === "espera"
                      ? "bg-espera/85 hover:bg-espera"
                      : "bg-marca/85 hover:bg-marca"
                  }`}
                  style={{ height: `${(v / max) * 140}px` }}
                  title={`${v}`}
                />
                <span className="text-[10px] text-carbon/45 sm:text-xs">{d.labels[i]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="u-in rounded-[24px] border border-linea bg-surface p-6 shadow-sm lg:col-span-2" style={{ animationDelay: "0.42s" }}>
          <p className="mb-5 text-sm font-medium text-carbon/70">
            {tab === "espera" ? "Tiempos de espera" : t("metricas.tiempos")}
          </p>
          <div className="flex flex-col gap-3">
            {tiempos.map((r) => (
              <div key={r.rango} className="flex items-center gap-3">
                <span className="w-12 text-xs text-carbon/50">{r.rango}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-carbon/8">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      accent === "espera" ? "bg-espera/80" : "bg-emerald-500/80"
                    }`}
                    style={{ width: `${r.pct}%` }}
                  />
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
