"use client";

import { useState } from "react";
import { useApp } from "@/components/providers/Providers";
import {
  useSuperadminStore,
  cobroMensual,
  type OrganizacionRow,
} from "@/lib/store/superadmin-store";
import { OrgModal } from "@/components/admin/OrgModal";
import { Paginacion, slicePage } from "@/components/ui/Paginacion";

type Periodo = "dia" | "semana" | "mes" | "ano";
const MULT: Record<Periodo, number> = { dia: 1, semana: 6.5, mes: 28, ano: 330 };
const PAGE_SIZE = 8;

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

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
}) => (
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

const SuperadminPage = () => {
  const { t } = useApp();
  const organizaciones = useSuperadminStore((s) => s.organizaciones);

  const [periodo, setPeriodo] = useState<Periodo>("dia");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<
    { mode: "crear" } | { mode: "ver"; org: OrganizacionRow } | null
  >(null);

  const orgAbierta =
    modal?.mode === "ver"
      ? organizaciones.find((o) => o.id === modal.org.id) ?? modal.org
      : null;

  const activas = organizaciones.filter((o) => o.activo);
  const mrr = activas
    .filter((o) => o.pagado)
    .reduce((a, o) => a + cobroMensual(o), 0);
  const morosos = activas.filter((o) => !o.pagado).length;
  const sucursalesActivas = organizaciones.reduce(
    (a, o) => a + o.sucursales.filter((s) => s.activo).length,
    0,
  );
  const pedidos = Math.round(
    organizaciones.reduce(
      (a, o) => a + o.sucursales.reduce((b, s) => b + s.pedidosHoy, 0),
      0,
    ) * MULT[periodo],
  );
  const pageItems = slicePage(organizaciones, page, PAGE_SIZE);
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
          label={t("super.orgsActivas")}
          value={String(activas.length)}
          delay={0.05}
        />
        <Metric
          label={t("super.sucursalesActivas")}
          value={String(sucursalesActivas)}
          delay={0.08}
        />
        <Metric label={t("super.mrr")} value={money.format(mrr)} delay={0.12} />
        <Metric
          label={t("super.morosos")}
          value={String(morosos)}
          delay={0.16}
          alerta={morosos > 0}
        />
      </div>

      <p className="text-center text-xs text-carbon/45 sm:text-left">
        {t("super.pedidosPeriodo", {
          n: pedidos.toLocaleString("es-AR"),
        })}
      </p>

      <div className="flex flex-col gap-3">
        {organizaciones.length === 0 && (
          <p className="rounded-[24px] border border-linea bg-surface px-6 py-12 text-center text-sm text-carbon/45">
            {t("super.sinOrgs")}
          </p>
        )}
        {pageItems.map((o) => {
          const nSuc = o.sucursales.filter((s) => s.activo).length;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setModal({ mode: "ver", org: o })}
              className="flex w-full flex-col gap-3 rounded-2xl border border-linea bg-surface p-4 text-left shadow-sm transition hover:border-marca/40 hover:bg-marca/5 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-carbon">{o.nombre}</p>
                <p className="truncate text-xs text-carbon/50">
                  {o.responsable} · {o.duenoEmail}
                </p>
                <p className="text-xs text-carbon/40">
                  {t("super.cupoResumen", {
                    usadas: nSuc,
                    cupo: o.cupo,
                  })}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-left sm:text-right">
                  <p className="font-display text-lg text-marca">
                    {money.format(cobroMensual(o))}
                  </p>
                  <p className="text-[10px] text-carbon/45">{t("super.cobro")}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    o.pagado
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-red-100 text-red-600"
                  }`}
                >
                  {o.pagado ? t("super.pagado") : t("super.impago")}
                </span>
                <span className="text-carbon/30">→</span>
              </div>
            </button>
          );
        })}
        <Paginacion
          page={page}
          pageSize={PAGE_SIZE}
          total={organizaciones.length}
          onChange={setPage}
        />
      </div>

      {modal?.mode === "crear" && (
        <OrgModal mode="crear" onClose={() => setModal(null)} />
      )}
      {modal?.mode === "ver" && orgAbierta && (
        <OrgModal
          mode="ver"
          org={orgAbierta}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};

export default SuperadminPage;
