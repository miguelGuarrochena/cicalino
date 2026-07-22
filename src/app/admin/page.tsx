"use client";

import { useState } from "react";
import { useApp } from "@/components/providers/Providers";
import {
  useSuperadminStore,
  PLAN_PRECIO,
  type LocalRow,
  type PlanId,
} from "@/lib/store/superadmin-store";
import type { TipoNegocio } from "@/lib/store/config-store";
import { LocalModal } from "@/components/admin/LocalModal";
import { Paginacion, slicePage } from "@/components/ui/Paginacion";

type Periodo = "dia" | "semana" | "mes" | "ano";
const MULT: Record<Periodo, number> = { dia: 1, semana: 6.5, mes: 28, ano: 330 };
const PAGE_SIZE = 8;

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const TIPO_LABEL: Record<TipoNegocio, string> = {
  cafeteria: "Cafetería",
  panaderia: "Panadería",
  rotiseria: "Rotisería",
  heladeria: "Heladería",
  otro: "Otro",
};

const PLAN_BADGE: Record<PlanId, string> = {
  prueba: "bg-carbon/8 text-carbon/60",
  base: "bg-marca/12 text-marca",
  pro: "bg-amber-100 text-amber-700",
};

const Metric = ({
  label,
  value,
  delay,
  alerta,
}: {
  label: string;
  value: string;
  delay: number;
  alerta?: boolean;
}) => {
  return (
    <div
      className="u-in rounded-[24px] border border-linea bg-surface p-5 shadow-sm"
      style={{ animationDelay: `${delay}s` }}
    >
      <p className="text-sm text-carbon/55">{label}</p>
      <p
        className={`mt-2 font-display text-3xl uppercase tracking-tight sm:text-4xl ${
          alerta ? "text-red-500" : "text-marca"
        }`}
      >
        {value}
      </p>
    </div>
  );
};

const SuperadminPage = () => {
  const { t } = useApp();
  const locales = useSuperadminStore((s) => s.locales);

  const [periodo, setPeriodo] = useState<Periodo>("dia");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<
    | { mode: "crear" }
    | { mode: "ver"; local: LocalRow }
    | null
  >(null);

  // Releer local fresco del store cuando el modal está abierto (tras editar).
  const localAbierto =
    modal?.mode === "ver"
      ? locales.find((l) => l.id === modal.local.id) ?? modal.local
      : null;

  const activos = locales.filter((l) => l.activo);
  const mrr = activos
    .filter((l) => l.pagado)
    .reduce((a, l) => a + PLAN_PRECIO[l.plan], 0);
  const morosos = activos.filter((l) => !l.pagado).length;
  const pedidos = Math.round(
    locales.reduce((a, l) => a + l.pedidosHoy, 0) * MULT[periodo],
  );
  const pageItems = slicePage(locales, page, PAGE_SIZE);

  const periodos: Periodo[] = ["dia", "semana", "mes", "ano"];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl uppercase tracking-tight text-carbon sm:text-4xl">
          {t("super.subtitulo")}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 overflow-x-auto rounded-full border border-linea bg-surface p-1">
            {periodos.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriodo(p)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition sm:px-4 ${
                  periodo === p
                    ? "bg-marca text-crema"
                    : "text-carbon/55 hover:text-carbon"
                }`}
              >
                {t(`metricas.periodo.${p}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setModal({ mode: "crear" })}
            className="shrink-0 rounded-full bg-marca px-4 py-2.5 text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95"
          >
            + {t("super.crear")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Metric
          label={t("super.localesActivos")}
          value={String(activos.length)}
          delay={0.05}
        />
        <Metric label={t("super.mrr")} value={money.format(mrr)} delay={0.1} />
        <Metric
          label={t("super.totalPedidos")}
          value={pedidos.toLocaleString("es-AR")}
          delay={0.15}
        />
        <Metric
          label={t("super.morosos")}
          value={String(morosos)}
          delay={0.2}
          alerta={morosos > 0}
        />
      </div>

      {/* Lista de locales */}
      <div className="flex flex-col gap-3">
        {locales.length === 0 && (
          <p className="rounded-[24px] border border-linea bg-surface px-6 py-12 text-center text-sm text-carbon/45">
            {t("super.sinLocales")}
          </p>
        )}
        {pageItems.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setModal({ mode: "ver", local: l })}
            className="flex w-full flex-col gap-3 rounded-2xl border border-linea bg-surface p-4 text-left shadow-sm transition hover:border-marca/40 hover:bg-marca/5 sm:flex-row sm:flex-wrap sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-semibold text-carbon">{l.nombre}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${PLAN_BADGE[l.plan]}`}
                >
                  {l.plan}
                </span>
              </div>
              <p className="truncate text-xs text-carbon/50">
                {l.responsable || "—"}
                {l.cuil ? ` · CUIL ${l.cuil}` : ""}
              </p>
              <p className="truncate text-xs text-carbon/40">
                {TIPO_LABEL[l.tipo]} · {l.adminEmail}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="text-left sm:text-right">
                <p className="font-display text-lg text-marca">{l.pedidosHoy}</p>
                <p className="text-[10px] text-carbon/45">
                  {t("super.totalPedidos")}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  l.pagado
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-600"
                }`}
              >
                {l.pagado ? t("super.pagado") : t("super.impago")}
              </span>
              <span
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  l.activo
                    ? "bg-carbon/8 text-carbon/60"
                    : "bg-carbon/5 text-carbon/40"
                }`}
              >
                {l.activo ? t("super.activo") : t("super.pausado")}
              </span>
              <span className="ml-auto text-carbon/30 sm:ml-0">→</span>
            </div>
          </button>
        ))}
        <Paginacion
          page={page}
          pageSize={PAGE_SIZE}
          total={locales.length}
          onChange={setPage}
        />
      </div>

      {modal?.mode === "crear" && (
        <LocalModal mode="crear" onClose={() => setModal(null)} />
      )}
      {modal?.mode === "ver" && localAbierto && (
        <LocalModal
          mode="ver"
          local={localAbierto}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};
export default SuperadminPage;
