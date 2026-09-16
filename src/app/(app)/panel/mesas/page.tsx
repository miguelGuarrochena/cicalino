"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useSessionStore } from "@/lib/store/session-store";
import { useConfigStore } from "@/lib/store/config-store";
import { useActiveEmployee } from "@/lib/hooks/useActiveEmployee";
import { useTableBills } from "@/lib/hooks/useTableBills";
import { SyncErrorBanner } from "@/components/panel/SyncErrorBanner";
import { MascotLoader } from "@/components/ui/MascotLoader";
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

/* Unpaid first, then partly paid, then tables with nothing ordered yet. */
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

const MesasPage = () => {
  const { t } = useApp();
  const branchId = useSessionStore((s) => s.sucursalId);
  const role = useSessionStore((s) => s.rol);
  const moduloPagos = useConfigStore((s) => s.moduloPagos);
  const branchName = useConfigStore((s) => s.name);
  const branchConfigReady = useConfigStore((s) => s.branchConfigReady);
  const employee = useActiveEmployee();
  const { bills, ready, live, syncError, refresh } = useTableBills(
    moduloPagos ? branchId : null,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [settings, setSettings] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);
  const [showClosed, setShowClosed] = useState(false);
  const canManage = role === "admin" || role === "supervisor" || role === "superadmin";

  useEffect(() => {
    if (!branchId || !moduloPagos) return;
    let alive = true;
    void fetchPaymentSettings(branchId).then((r) => {
      if (alive && r.ok) setSettings(r.data.settings);
    });
    return () => {
      alive = false;
    };
  }, [branchId, moduloPagos]);

  if (!branchConfigReady) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <MascotLoader className="h-16" />
      </div>
    );
  }

  if (!moduloPagos) {
    return (
      <div className="rounded-[24px] border border-linea bg-surface p-6 text-center">
        <p className="font-display text-xl uppercase text-carbon">{t("mesas.sinModuloTitulo")}</p>
        <p className="mt-2 text-sm text-carbon/60">{t("mesas.sinModulo")}</p>
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
            className="min-h-10 rounded-full border border-linea px-4 py-2 text-sm font-semibold text-carbon/75 hover:bg-carbon/5"
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
        <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          {/* On phones the list and the table take turns; on wide screens both
              are visible. */}
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

            {!openBills.length && (
              <p className="rounded-2xl border border-dashed border-linea p-6 text-center text-sm text-carbon/55">
                {t("mesas.sinMesasAbiertas")}
              </p>
            )}

            <ul className="flex flex-col gap-2">
              {openBills.map((b) => {
                const status = billStatus(b);
                const style = STATUS_STYLE[status];
                const active = desktopCurrent?.session.id === b.session.id;
                const waiting = waitingCount(b);
                const kitchen = kitchenCount(b);
                return (
                  <li key={b.session.id}>
                    <button
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => setSelected(b.session.id)}
                      className={`flex w-full flex-col gap-2 rounded-2xl border bg-surface p-3 text-left transition ${
                        active ? "lg:border-marca lg:ring-2 lg:ring-marca/20" : "border-linea hover:border-marca/40"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <span aria-hidden className={`size-3 rounded-full ${style.dot}`} />
                          <span className="font-display text-xl uppercase text-carbon">
                            {t("mesa.mesaN", { n: b.session.tableNumber })}
                          </span>
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.chip}`}>
                          {t(`mesas.estadoCobro.${status}`)}
                        </span>
                      </span>
                      {status !== "sin-consumo" && (
                        <span className="grid grid-cols-3 gap-1 text-xs tabular-nums">
                          <span>
                            <span className="block text-carbon/50">{t("mesa.total")}</span>
                            <span className="font-semibold text-carbon">{formatMoney(b.totals.total)}</span>
                          </span>
                          <span>
                            <span className="block text-carbon/50">{t("mesa.pagado")}</span>
                            <span className="font-semibold text-carbon">{formatMoney(b.totals.paid)}</span>
                          </span>
                          <span>
                            <span className="block text-carbon/50">{t("mesa.pendiente")}</span>
                            <span className={`font-semibold ${billPending(b) > 0 ? "text-red-700 dark:text-red-300" : "text-carbon"}`}>
                              {formatMoney(billPending(b))}
                            </span>
                          </span>
                        </span>
                      )}
                      {(waiting > 0 || kitchen > 0) && (
                        <span className="flex flex-wrap gap-1">
                          {waiting > 0 && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
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
                canManage={canManage}
                onChanged={() => void refresh()}
                onBack={() => setSelected(null)}
              />
            ) : (
              <div className="rounded-[24px] border border-dashed border-linea p-10 text-center text-sm text-carbon/55">
                {t("mesas.elegiMesa")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MesasPage;
