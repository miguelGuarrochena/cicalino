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
import { fetchPaymentSettings } from "@/lib/data/tables";
import {
  DEFAULT_PAYMENT_SETTINGS,
  formatMoney,
  type PaymentSettings,
  type TableBill,
} from "@/lib/tableBill";

const pendingCount = (b: TableBill) =>
  b.payments.filter((p) => p.status === "pendiente").length;
const kitchenCount = (b: TableBill) =>
  b.orders.filter((o) => o.status === "creado" || o.status === "en_preparacion").length;

const MesasPage = () => {
  const { t } = useApp();
  const branchId = useSessionStore((s) => s.sucursalId);
  const moduloPagos = useConfigStore((s) => s.moduloPagos);
  const branchConfigReady = useConfigStore((s) => s.branchConfigReady);
  const employee = useActiveEmployee();
  const { bills, ready, live, syncError, refresh } = useTableBills(
    moduloPagos ? branchId : null,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [settings, setSettings] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);
  const [showClosed, setShowClosed] = useState(false);

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

  const openBills = bills.filter((b) => b.session.status === "abierta");
  const closedBills = bills.filter((b) => b.session.status !== "abierta");
  const current =
    bills.find((b) => b.session.id === selected) ?? openBills[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-tight text-carbon">
            {t("mesas.titulo")}
          </h1>
          <p className="text-sm text-carbon/60">{t("mesas.subtitulo")}</p>
        </div>
        <Link
          href="/panel/mesas/qr"
          className="min-h-10 rounded-full border border-linea px-4 py-2 text-sm font-semibold text-carbon/75 hover:bg-carbon/5"
        >
          {t("mesas.verQr")}
        </Link>
      </header>

      <SyncErrorBanner error={syncError} />

      {live && !ready ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <MascotLoader className="h-16" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <aside className="flex flex-col gap-2">
            {!openBills.length && (
              <p className="rounded-2xl border border-dashed border-linea p-6 text-center text-sm text-carbon/55">
                {t("mesas.sinMesasAbiertas")}
              </p>
            )}
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              {openBills.map((b) => {
                const active = current?.session.id === b.session.id;
                const pend = pendingCount(b);
                const cocina = kitchenCount(b);
                return (
                  <li key={b.session.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelected(b.session.id)}
                      className={`flex w-full flex-col gap-1 rounded-2xl border p-3 text-left transition ${
                        active ? "border-marca bg-marca/5 ring-2 ring-marca/20" : "border-linea bg-surface hover:border-marca/40"
                      }`}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-display text-xl uppercase text-marca">
                          {t("mesa.mesaN", { n: b.session.tableNumber })}
                        </span>
                        <span className="text-xs text-carbon/55">{b.guests.length} 👤</span>
                      </span>
                      <span className="text-sm tabular-nums text-carbon">
                        {formatMoney(b.totals.total)}
                      </span>
                      <span className="text-xs tabular-nums text-carbon/55">
                        {t("mesas.faltaN", {
                          n: formatMoney(Math.max(b.totals.total - b.totals.paid, 0)),
                        })}
                      </span>
                      {(pend > 0 || cocina > 0) && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {pend > 0 && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                              {t("mesas.pagosPorConfirmar", { n: pend })}
                            </span>
                          )}
                          {cocina > 0 && (
                            <span className="rounded-full bg-marca/10 px-2 py-0.5 text-[10px] font-semibold text-marca">
                              {t("mesas.pedidosPorPreparar", { n: cocina })}
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
              <div className="mt-2">
                <button
                  type="button"
                  aria-expanded={showClosed}
                  onClick={() => setShowClosed((v) => !v)}
                  className="text-xs font-semibold text-carbon/60 underline"
                >
                  {t("mesas.cerradasHoy", { n: closedBills.length })}
                </button>
                {showClosed && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {closedBills.map((b) => (
                      <li key={b.session.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(b.session.id)}
                          className="flex w-full justify-between rounded-xl px-2 py-1.5 text-left text-sm text-carbon/70 hover:bg-carbon/5"
                        >
                          <span>{t("mesa.mesaN", { n: b.session.tableNumber })}</span>
                          <span className="tabular-nums">{formatMoney(b.totals.paid)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </aside>

          <div>
            {current ? (
              <TableDetail
                key={current.session.id}
                bill={current}
                settings={settings}
                employeeId={employee?.id ?? null}
                onChanged={() => void refresh()}
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
