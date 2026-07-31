"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers/Providers";
import {
  useSuperadminStore,
  monthlyCharge,
  isContractPending,
  type OrganizationRow,
} from "@/lib/store/superadmin-store";
import { useSessionStore } from "@/lib/store/session-store";
import { OrgModal } from "@/components/admin/OrgModal";
import { SolicitudesPanel } from "@/components/admin/SolicitudesPanel";
import { PedidosSucursalPanel } from "@/components/admin/PedidosSucursalPanel";
import { CobrosPanel } from "@/components/admin/CobrosPanel";
import { Pagination, slicePage } from "@/components/ui/Pagination";
import { useSuperadminSync } from "@/lib/hooks/useSuperadminSync";
import { ensureDemoOrg } from "@/lib/actions/superadmin";
import { refreshOrganizations } from "@/lib/data/superadmin";
import { useToast } from "@/components/ui/Toast";
import { Spinner } from "@/components/ui/Spinner";
import { MascotLoader } from "@/components/ui/MascotLoader";

const PAGE_SIZE = 8;

type FiltroOrg = "todas" | "activas" | "impagos" | "pausadas";

const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-4 py-3 text-carbon outline-none transition focus:border-marca focus:ring-2 focus:ring-marca/20 placeholder:text-carbon/40";

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
    className="u-in w-full rounded-[20px] border border-linea bg-surface px-4 py-4 shadow-sm sm:rounded-[24px] sm:p-5"
    style={{ animationDelay: `${delay}s` }}
  >
    <p className="text-sm text-carbon/55">{label}</p>
    <p
      className={`mt-1.5 break-words font-display text-2xl uppercase tracking-tight sm:mt-2 sm:text-4xl ${
        alerta ? "text-red-500" : "text-marca"
      }`}
    >
      {value}
    </p>
  </div>
);

const SuperadminPage = () => {
  const { t } = useApp();
  const toast = useToast();
  const router = useRouter();
  const { ready: syncReady } = useSuperadminSync();
  const organizations = useSuperadminStore((s) => s.organizaciones);
  const enterAsOwner = useSessionStore((s) => s.entrarComoDueño);

  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<FiltroOrg>("todas");
  const [page, setPage] = useState(1);
  const [abriendoDemo, setAbriendoDemo] = useState(false);
  const [modal, setModal] = useState<
    { mode: "crear" } | { mode: "ver"; org: OrganizationRow } | null
  >(null);

  const filtradas = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return organizations.filter((o) => {
      if (filtro === "activas" && !o.activo) return false;
      if (filtro === "pausadas" && o.activo) return false;
      if (filtro === "impagos" && (o.pagado || !o.activo)) return false;
      if (!needle) return true;
      const hay = [o.nombre, o.responsable, o.telefono, o.duenoEmail, o.cuil]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [organizations, q, filtro]);

  useEffect(() => {
    setPage(1);
  }, [q, filtro]);

  useEffect(() => {
    const max = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE) || 1);
    if (page > max) setPage(max);
  }, [filtradas.length, page]);

  const abrirDemo = async () => {
    setAbriendoDemo(true);
    const res = await ensureDemoOrg();
    if (!res.ok) {
      setAbriendoDemo(false);
      toast(res.error || t("super.demoError"), "error");
      return;
    }
    await refreshOrganizations();
    enterAsOwner({
      organizacionId: res.demo.organizacionId,
      organizacionNombre: res.demo.organizacionNombre,
      sucursalId: res.demo.sucursalId,
      sucursalNombre: res.demo.sucursalNombre,
    });
    setAbriendoDemo(false);
    router.push("/panel");
  };

  const orgAbierta =
    modal?.mode === "ver"
      ? organizations.find((o) => o.id === modal.org.id) ?? modal.org
      : null;

  const activas = organizations.filter((o) => o.activo);
  const mrr = activas
    .filter((o) => o.pagado)
    .reduce((a, o) => a + monthlyCharge(o), 0);
  const morosos = activas.filter((o) => !o.pagado).length;
  const activeBranches = organizations.reduce(
    (a, o) => a + o.sucursales.filter((s) => s.activo).length,
    0,
  );
  const pageItems = slicePage(filtradas, page, PAGE_SIZE);

  const countFiltro = (f: FiltroOrg) => {
    if (f === "todas") return organizations.length;
    if (f === "activas") return organizations.filter((o) => o.activo).length;
    if (f === "pausadas") return organizations.filter((o) => !o.activo).length;
    return organizations.filter((o) => o.activo && !o.pagado).length;
  };

  const filtros: { key: FiltroOrg; label: string }[] = [
    { key: "todas", label: t("super.filtroTodas") },
    { key: "activas", label: t("super.filtroActivas") },
    { key: "impagos", label: t("super.filtroImpagos") },
    { key: "pausadas", label: t("super.filtroPausadas") },
  ];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-carbon/45">
        Superadmin
      </p>
      {!syncReady && (
        <div
          className="flex items-center justify-center rounded-2xl border border-linea bg-surface px-4 py-8"
          role="status"
        >
          <MascotLoader className="h-16" label="Cargando empresas…" />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <h1 className="font-display text-2xl uppercase tracking-tight text-carbon sm:text-4xl">
          {t("super.subtitulo")}
        </h1>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={() => void abrirDemo()}
            disabled={abriendoDemo}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-marca/30 bg-crema px-4 py-3 text-sm font-semibold text-marca transition hover:bg-marca hover:text-crema active:scale-95 disabled:opacity-60 sm:w-auto sm:py-2.5"
          >
            {abriendoDemo ? (
              <>
                <Spinner className="size-3.5" inline />
                {t("super.abriendoDemo")}
              </>
            ) : (
              t("super.abrirDemo")
            )}
          </button>
          <button
            type="button"
            onClick={() => setModal({ mode: "crear" })}
            className="w-full rounded-full bg-marca px-4 py-3 text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95 sm:w-auto sm:py-2.5"
          >
            + {t("super.crear")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <Metric
          label={t("super.orgsActivas")}
          value={String(activas.length)}
          delay={0.05}
        />
        <Metric
          label={t("super.sucursalesActivas")}
          value={String(activeBranches)}
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

      <SolicitudesPanel />
      <PedidosSucursalPanel
        onAbrir={(id) => {
          const org = organizations.find((o) => o.id === id);
          if (org) setModal({ mode: "ver", org });
        }}
      />
      <CobrosPanel
        onAbrir={(id) => {
          const org = organizations.find((o) => o.id === id);
          if (org) setModal({ mode: "ver", org });
        }}
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {filtros.map(({ key, label }) => {
              const active = filtro === key;
              const n = countFiltro(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFiltro(key)}
                  className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition sm:text-sm ${
                    active
                      ? "bg-marca text-crema"
                      : "border border-linea bg-surface text-carbon/60 hover:bg-carbon/5"
                  }`}
                >
                  {label}
                  <span
                    className={`ml-1.5 ${active ? "opacity-80" : "opacity-50"}`}
                  >
                    {n}
                  </span>
                </button>
              );
            })}
          </div>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("super.buscarPh")}
            className={INPUT}
          />
        </div>

        {organizations.length === 0 && (
          <p className="rounded-[24px] border border-linea bg-surface px-6 py-12 text-center text-sm text-carbon/45">
            {t("super.sinOrgs")}
          </p>
        )}
        {organizations.length > 0 && filtradas.length === 0 && (
          <p className="rounded-[24px] border border-linea bg-surface px-6 py-12 text-center text-sm text-carbon/45">
            {t("super.sinResultados")}
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
                  {o.responsable}
                  {o.telefono ? ` · ${o.telefono}` : ""} · {o.duenoEmail}
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
                    {money.format(monthlyCharge(o))}
                  </p>
                  <p className="text-[10px] text-carbon/45">{t("super.cobro")}</p>
                </div>
                {isContractPending(o) && !o.activo ? (
                  <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800">
                    Esperando condiciones
                  </span>
                ) : !o.activo && o.contratoAceptadoEn ? (
                  <span className="rounded-full bg-sky-100 px-3 py-1.5 text-xs font-semibold text-sky-800">
                    Lista para activar
                  </span>
                ) : (
                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      o.pagado
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-600"
                    }`}
                  >
                    {o.pagado ? t("super.pagado") : t("super.impago")}
                  </span>
                )}
                <span className="text-carbon/30">→</span>
              </div>
            </button>
          );
        })}
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={filtradas.length}
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
