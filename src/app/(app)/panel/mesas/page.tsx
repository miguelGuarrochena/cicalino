"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useSessionStore } from "@/lib/store/session-store";
import { useConfigStore } from "@/lib/store/config-store";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import { useActiveEmployee } from "@/lib/hooks/useActiveEmployee";
import { useTableBills } from "@/lib/hooks/useTableBills";
import { SyncErrorBanner } from "@/components/panel/SyncErrorBanner";
import { MascotLoader } from "@/components/ui/MascotLoader";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableDetail } from "@/components/panel/mesas/TableDetail";
import { STATUS_STYLE } from "@/components/panel/mesas/BillStatusBadge";
import { fetchPaymentSettings } from "@/lib/data/tables";
import {
  DEFAULT_PAYMENT_SETTINGS,
  billPending,
  billStatus,
  formatMoney,
  type BillStatus,
  type PaymentSettings,
  type TableBill,
} from "@/lib/tableBill";

const ORDER: Record<BillStatus, number> = {
  pendiente: 0,
  parcial: 1,
  "sin-consumo": 2,
  pagada: 3,
  cerrada: 4,
};

const waitingCount = (b: TableBill) =>
  b.payments.filter((p) => p.status === "pendiente").length;
const kitchenCount = (b: TableBill) =>
  b.orders.filter((o) => o.status === "creado" || o.status === "en_preparacion").length;

const needsAttention = (b: TableBill) => {
  const s = billStatus(b);
  return s === "pendiente" || s === "parcial" || waitingCount(b) > 0;
};

const MesasPage = () => {
  const { t } = useApp();
  const branchId = useSessionStore((s) => s.sucursalId);
  const { visibles, canManage, ready: branchReady } = useOperationalAccess();
  const branchName = useConfigStore((s) => s.name);
  const employee = useActiveEmployee();
  const { bills, ready, live, syncError, refresh } = useTableBills(
    visibles.pagos ? branchId : null,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [settings, setSettings] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);
  const [showClosed, setShowClosed] = useState(false);
  const [filtro, setFiltro] = useState<"atencion" | "todas">("atencion");

  useEffect(() => {
    if (!branchId || !visibles.pagos) return;
    let alive = true;
    void fetchPaymentSettings(branchId).then((r) => {
      if (alive && r.ok) setSettings(r.data.settings);
    });
    return () => {
      alive = false;
    };
  }, [branchId, visibles.pagos]);

  if (!branchReady || !visibles.pagos) {
    return branchReady ? null : (
      <div className="flex min-h-[40vh] items-center justify-center">
        <MascotLoader className="h-16" />
      </div>
    );
  }

  const openBills = bills
    .filter((b) => b.session.status === "abierta")
    .sort(
      (a, b) =>
        ORDER[billStatus(a)] - ORDER[billStatus(b)] ||
        billPending(b) - billPending(a) ||
        a.session.tableNumber - b.session.tableNumber,
    );
  const closedBills = bills.filter((b) => b.session.status !== "abierta");
  const current = bills.find((b) => b.session.id === selected) ?? null;
  const desktopCurrent = current ?? openBills[0] ?? null;
  const shown = filtro === "atencion" ? openBills.filter(needsAttention) : openBills;
  const attentionN = openBills.filter(needsAttention).length;

  const count = (s: BillStatus) => openBills.filter((b) => billStatus(b) === s).length;
  const totalPending = openBills.reduce((sum, b) => sum + billPending(b), 0);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-tight text-carbon">
            {t("mesas.titulo")}
          </h1>
          <p className="text-sm text-carbon/60">
            {totalPending > 0
              ? t("mesas.pendienteTotal", { n: formatMoney(totalPending) })
              : t("mesas.subtitulo")}
          </p>
        </div>
        {canManage && (
          <Link
            href="/panel/mesas/qr"
            className="min-h-10 rounded-full border border-linea px-4 py-2 text-sm font-semibold text-carbon/75 transition hover:bg-carbon/5 active:scale-[0.98]"
          >
            {t("mesas.verQr")}
          </Link>
        )}
      </header>

      <SyncErrorBanner error={syncError} />

      {live && !ready ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <MascotLoader className="h-16" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(18rem,22rem)_1fr]">
          <aside className={`flex flex-col gap-3 print:hidden ${current ? "hidden lg:flex" : "flex"}`}>
            {openBills.length > 0 && (
              <ul className="flex flex-wrap gap-2 text-xs font-semibold" aria-label={t("mesas.resumen")}>
                {(["pendiente", "parcial", "pagada"] as const).map((s) =>
                  count(s) > 0 ? (
                    <li key={s} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${STATUS_STYLE[s].chip}`}>
                      <span aria-hidden className={`size-2 rounded-full ${STATUS_STYLE[s].dot}`} />
                      {t(`mesas.resumenEstado.${s}`, { n: count(s) })}
                    </li>
                  ) : null,
                )}
              </ul>
            )}

            {openBills.length > 0 && (
              <div className="flex rounded-full border border-linea bg-surface p-1">
                {(
                  [
                    ["atencion", t("mesas.filtroAtencion", { n: attentionN })],
                    ["todas", t("mesas.filtroTodas", { n: openBills.length })],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFiltro(k)}
                    className={`min-h-9 flex-1 rounded-full px-3 text-xs font-semibold transition ${
                      filtro === k ? "bg-marca text-crema" : "text-carbon/55 hover:text-carbon"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {!shown.length && (
              <EmptyState
                title={
                  openBills.length
                    ? t("mesas.sinAtencion")
                    : t("mesas.sinMesasAbiertas")
                }
              />
            )}

            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              {shown.map((b) => {
                const status = billStatus(b);
                const style = STATUS_STYLE[status];
                const active = desktopCurrent?.session.id === b.session.id;
                const waiting = waitingCount(b);
                const kitchen = kitchenCount(b);
                const pending = billPending(b);
                return (
                  <li key={b.session.id}>
                    <button
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => setSelected(b.session.id)}
                      className={`flex min-h-[7.5rem] w-full flex-col gap-2 rounded-[22px] border bg-surface p-3 text-left transition hover:border-marca/40 active:scale-[0.99] ${style.ring} ${
                        active ? "lg:ring-2 lg:ring-marca/25" : ""
                      }`}
                    >
                      <span className="flex items-start justify-between gap-1">
                        <span className="font-display text-2xl uppercase leading-none text-carbon sm:text-3xl">
                          {b.session.tableNumber}
                        </span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.chip}`}>
                          <span aria-hidden className={`size-1.5 rounded-full ${style.dot}`} />
                          {t(`mesas.estadoCobro.${status}`)}
                        </span>
                      </span>
                      {status !== "sin-consumo" ? (
                        <span className="mt-auto">
                          <span className="block text-[10px] font-semibold uppercase tracking-wide text-carbon/45">
                            {t("mesa.pendiente")}
                          </span>
                          <span
                            className={`font-display text-lg tabular-nums sm:text-xl ${
                              pending > 0 ? "text-alerta" : "text-ok"
                            }`}
                          >
                            {formatMoney(pending)}
                          </span>
                        </span>
                      ) : (
                        <span className="mt-auto text-xs text-carbon/45">{t("mesas.estadoCobro.sin-consumo")}</span>
                      )}
                      {(waiting > 0 || kitchen > 0) && (
                        <span className="flex flex-wrap gap-1">
                          {waiting > 0 && (
                            <span className="rounded-full bg-curso-fondo px-2 py-0.5 text-[10px] font-semibold text-curso">
                              {t("mesas.pagosPorConfirmar", { n: waiting })}
                            </span>
                          )}
                          {kitchen > 0 && (
                            <span className="rounded-full bg-marca/10 px-2 py-0.5 text-[10px] font-semibold text-marca">
                              {t("mesas.pedidosPorPreparar", { n: kitchen })}
                            </span>
                          )}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            {closedBills.length > 0 && (
              <div>
                <button
                  type="button"
                  aria-expanded={showClosed}
                  onClick={() => setShowClosed((v) => !v)}
                  className="min-h-10 text-xs font-semibold text-carbon/60 underline"
                >
                  {t("mesas.cerradasHoy", { n: closedBills.length })}
                </button>
                {showClosed && (
                  <ul className="mt-1 flex flex-col gap-1">
                    {closedBills.map((b) => (
                      <li key={b.session.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(b.session.id)}
                          className="flex min-h-10 w-full items-center justify-between rounded-xl px-2 text-left text-sm text-carbon/70 hover:bg-carbon/5"
                        >
                          <span className="flex items-center gap-2">
                            <span aria-hidden className={`size-2 rounded-full ${STATUS_STYLE[billStatus(b)].dot}`} />
                            {t("mesa.mesaN", { n: b.session.tableNumber })}
                          </span>
                          <span className="tabular-nums">{formatMoney(b.totals.paid)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </aside>

          <div className={current ? "block" : "hidden lg:block"}>
            {desktopCurrent ? (
              <TableDetail
                key={desktopCurrent.session.id}
                bill={desktopCurrent}
                settings={settings}
                branchName={branchName}
                employeeId={employee?.id ?? null}
                employeeName={employee?.name ?? null}
                canManage={canManage}
                onChanged={() => void refresh()}
                onBack={() => setSelected(null)}
              />
            ) : (
              <EmptyState title={t("mesas.elegiMesa")} />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MesasPage;
