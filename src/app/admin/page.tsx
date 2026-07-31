"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers/Providers";
import {
  useSuperadminStore,
  monthlyCharge,
  type OrganizationRow,
} from "@/lib/store/superadmin-store";
import { useSessionStore } from "@/lib/store/session-store";
import { OrgModal } from "@/components/admin/OrgModal";
import { SolicitudesPanel } from "@/components/admin/SolicitudesPanel";
import { PedidosSucursalPanel } from "@/components/admin/PedidosSucursalPanel";
import { CobrosPanel } from "@/components/admin/CobrosPanel";
import { SubscriptionsPanel } from "@/components/admin/SubscriptionsPanel";
import { PaymentModal } from "@/components/admin/PaymentModal";
import { useSuperadminSync } from "@/lib/hooks/useSuperadminSync";
import { ensureDemoOrg } from "@/lib/actions/superadmin";
import { refreshOrganizations } from "@/lib/data/superadmin";
import { useToast } from "@/components/ui/Toast";
import { Spinner } from "@/components/ui/Spinner";
import { MascotLoader } from "@/components/ui/MascotLoader";



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
  const orgsError = useSuperadminStore((s) => s.orgsError);
  const enterAsOwner = useSessionStore((s) => s.entrarComoDueño);

  const [abriendoDemo, setAbriendoDemo] = useState(false);
  const [modal, setModal] = useState<
    { mode: "crear" } | { mode: "ver"; org: OrganizationRow } | null
  >(null);
  const [pagoOrgId, setPagoOrgId] = useState<string | null>(null);

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
      organizationId: res.demo.organizationId,
      organizationName: res.demo.organizationName,
      sucursalId: res.demo.sucursalId,
      branchName: res.demo.branchName,
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

      {orgsError && (
        <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-700">
            No se pudo leer la lista de empresas.
          </p>
          <p className="mt-1 text-xs text-red-700/80">{orgsError}</p>
          <p className="mt-1 text-xs text-red-700/70">
            Suele ser una migración pendiente en Supabase: falta una columna que
            la app está pidiendo.
          </p>
        </div>
      )}

      <SubscriptionsPanel
        orgs={organizations}
        onVerCliente={(id) => router.push(`/admin/cliente/${id}`)}
        onRegistrarPago={setPagoOrgId}
      />


      {pagoOrgId &&
        (() => {
          const org = organizations.find((o) => o.id === pagoOrgId);
          if (!org) return null;
          return (
            <PaymentModal
              org={org}
              onClose={() => setPagoOrgId(null)}
              onSaved={() => void refreshOrganizations()}
            />
          );
        })()}

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
