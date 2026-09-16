"use client";

import { useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useToast } from "@/components/ui/Toast";
import {
  ConsumptionTable,
  PaymentRows,
} from "@/components/tables/BillParts";
import { CobrarModal } from "@/components/panel/mesas/CobrarModal";
import { CloseTableModal } from "@/components/panel/mesas/CloseTableModal";
import { PrintableBill } from "@/components/panel/mesas/PrintableBill";
import { TableHistory } from "@/components/panel/mesas/TableHistory";
import { BillStatusBadge } from "@/components/panel/mesas/BillStatusBadge";
import { updateOrderStatus } from "@/lib/data/orders";
import { cancelTablePayment, confirmTablePayment } from "@/lib/data/tables";
import {
  billPending,
  formatMoney,
  type BillOrder,
  type BillPayment,
  type PaymentSettings,
  type TableBill,
} from "@/lib/tableBill";
import type { OrderStatus } from "@/lib/types";

type Tab = "pagos" | "consumo";

export const TableDetail = ({
  bill,
  settings,
  branchName,
  employeeId,
  canManage,
  onChanged,
  onBack,
}: {
  bill: TableBill;
  settings: PaymentSettings;
  branchName: string;
  employeeId: string | null;
  /* Manager or owner: voiding collected money and closing with a balance.
   * The database enforces it; this only hides buttons that would fail. */
  canManage: boolean;
  onChanged: () => void;
  onBack?: () => void;
}) => {
  const { t } = useApp();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("pagos");
  const [busy, setBusy] = useState<string | null>(null);
  const [cobrarOpen, setCobrarOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const open = bill.session.status === "abierta";
  const names = new Map(bill.guests.map((g) => [g.id, g.name]));
  const pending = billPending(bill);

  const errorText = (reason?: string) => {
    for (const k of [`mesas.error.${reason}`, `mesa.error.${reason}`]) {
      const txt = t(k);
      if (txt !== k) return txt;
    }
    return t("mesas.error.error");
  };

  const run = async (id: string, fn: () => Promise<{ ok: boolean; reason?: string }>, okMsg: string) => {
    setBusy(id);
    const res = await fn();
    setBusy(null);
    if (res.ok) {
      toast(okMsg, "success");
      onChanged();
    } else {
      toast(errorText(res.reason), "error");
    }
  };

  const moveOrder = (o: BillOrder, to: OrderStatus) =>
    run(
      o.id,
      async () => {
        const ok = await updateOrderStatus(o.id, to);
        /* A cancel rejected by pedidos_mesa_guard (payments already cover
         * the order) comes back as a failed update. */
        return ok ? { ok } : { ok, reason: to === "cancelado" ? "pagos-exceden" : "error" };
      },
      t(`mesas.pedidoMovido.${to}`),
    );

  const paymentActions = (p: BillPayment) => {
    if (!open || p.status === "cancelado") return null;
    const canConfirm = p.status === "pendiente" && p.method !== "mercado_pago";
    const canCancel =
      p.status === "pendiente" ||
      (canManage && p.status === "pagado" && p.method !== "mercado_pago");
    if (!canConfirm && !canCancel && !(p.status === "pendiente" && p.method === "mercado_pago")) {
      return null;
    }
    return (
      <div className="flex flex-wrap gap-2">
        {canConfirm && (
          <button
            type="button"
            disabled={busy === p.id}
            onClick={() =>
              void run(
                p.id,
                () => confirmTablePayment(p.id, employeeId),
                t("mesas.pagoConfirmadoMesa", { n: t("mesa.mesaN", { n: bill.session.tableNumber }) }),
              )
            }
            className="min-h-10 rounded-full bg-emerald-600 px-4 text-xs font-semibold text-white disabled:opacity-50"
          >
            {p.method === "transferencia" ? t("mesas.confirmarRecibido") : t("mesas.confirmarPago")}
          </button>
        )}
        {p.status === "pendiente" && p.method === "mercado_pago" && (
          <span className="self-center text-[11px] text-carbon/55">{t("mesas.mpSoloWebhook")}</span>
        )}
        {canCancel && (
          <button
            type="button"
            disabled={busy === p.id}
            onClick={() => {
              let motivo: string | null = null;
              if (p.status === "pagado") {
                motivo = window.prompt(t("mesas.motivoAnular"))?.trim() || null;
                if (!motivo) return;
              } else if (!window.confirm(t("mesas.cancelarPagoConfirmar"))) {
                return;
              }
              void run(p.id, () => cancelTablePayment(p.id, motivo, employeeId), t("mesas.pagoCancelado"));
            }}
            className="min-h-10 rounded-full border border-linea px-4 text-xs font-semibold text-carbon/70 disabled:opacity-50"
          >
            {p.status === "pagado" ? t("mesas.anularPago") : t("mesas.cancelarPago")}
          </button>
        )}
      </div>
    );
  };

  const activeOrders = bill.orders.filter(
    (o) => o.status !== "retirado" && o.status !== "cancelado",
  );

  return (
    <>
      <section className="rounded-[24px] border border-linea bg-surface p-4 shadow-sm sm:p-6 print:hidden">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-2 min-h-10 text-sm font-semibold text-carbon/60 lg:hidden"
          >
            ← {t("mesas.volverCobros")}
          </button>
        )}
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl uppercase text-marca">
              {t("mesa.mesaN", { n: bill.session.tableNumber })}
            </h2>
            <p className="text-sm text-carbon/60">
              {t("mesas.abiertaDesde", {
                h: new Date(bill.session.openedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              })}{" "}
              · {t("mesas.comensalesN", { n: bill.guests.length })}
            </p>
          </div>
          <BillStatusBadge bill={bill} />
        </header>

        {/* What a waiter needs at a glance, before any tab. */}
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          {(
            [
              ["mesa.total", bill.totals.total, "text-carbon"],
              ["mesa.pagado", bill.totals.paid, "text-emerald-700 dark:text-emerald-300"],
              ["mesa.pendiente", pending, pending > 0 ? "text-red-700 dark:text-red-300" : "text-carbon/50"],
            ] as const
          ).map(([k, v, cls]) => (
            <div key={k} className="rounded-2xl border border-linea bg-crema/40 px-2 py-2.5">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-carbon/50">{t(k)}</dt>
              <dd className={`mt-0.5 font-display text-lg tabular-nums sm:text-2xl ${cls}`}>
                {formatMoney(v)}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-3 flex flex-wrap gap-2">
          {open && pending > 0 && (
            <button
              type="button"
              onClick={() => setCobrarOpen(true)}
              className="min-h-12 flex-1 rounded-full bg-marca px-6 text-base font-semibold text-crema sm:flex-none"
            >
              {t("mesas.cobrar")}
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-12 rounded-full border border-linea px-5 text-sm font-semibold text-carbon/75"
          >
            {t("mesas.imprimirCuenta")}
          </button>
          {open && (pending <= 0 || canManage) && (
            <button
              type="button"
              onClick={() => setCloseOpen(true)}
              className="min-h-12 rounded-full border border-linea px-5 text-sm font-semibold text-carbon/60"
            >
              {t("mesas.cerrarMesa")}
            </button>
          )}
        </div>

        <div role="tablist" aria-label={t("mesas.vistas")} className="mt-5 flex rounded-2xl border border-linea bg-crema/40 p-1">
          {(["pagos", "consumo"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`min-h-11 flex-1 rounded-xl px-3 text-sm font-semibold transition ${
                tab === k ? "bg-marca text-crema shadow-sm" : "text-carbon/60 hover:text-carbon"
              }`}
            >
              {t(`mesas.tab.${k}`)}
            </button>
          ))}
        </div>

        {tab === "consumo" ? (
          <div className="mt-4 flex flex-col gap-5">
            {activeOrders.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-carbon/50">
                  {t("mesas.pedidosEnCurso")}
                </h3>
                <ul className="flex flex-col gap-2">
                  {activeOrders.map((o) => (
                    <li key={o.id} className="rounded-2xl border border-linea p-3">
                      <p className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-semibold text-carbon">
                          {o.guestId ? names.get(o.guestId) : "—"}
                        </span>
                        <span className="text-xs text-carbon/55">
                          {new Date(o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {" · "}
                          {t(`mesa.estadoPedido.${o.status}`)}
                        </span>
                      </p>
                      <ul className="mt-1.5 text-sm text-carbon/75">
                        {o.items.map((i) => (
                          <li key={i.id}>
                            {i.quantity} × {i.name}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {o.status !== "listo" && (
                          <button
                            type="button"
                            disabled={busy === o.id}
                            onClick={() => void moveOrder(o, "listo")}
                            className="min-h-10 rounded-full bg-marca px-4 text-xs font-semibold text-crema disabled:opacity-50"
                          >
                            {t("mesas.marcarListo")}
                          </button>
                        )}
                        {o.status === "listo" && (
                          <button
                            type="button"
                            disabled={busy === o.id}
                            onClick={() => void moveOrder(o, "retirado")}
                            className="min-h-10 rounded-full bg-marca px-4 text-xs font-semibold text-crema disabled:opacity-50"
                          >
                            {t("mesas.marcarEntregado")}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy === o.id}
                          onClick={() => {
                            if (window.confirm(t("mesas.cancelarPedidoConfirmar"))) {
                              void moveOrder(o, "cancelado");
                            }
                          }}
                          className="min-h-10 rounded-full border border-linea px-4 text-xs font-semibold text-carbon/70 disabled:opacity-50"
                        >
                          {t("mesas.cancelarPedido")}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-carbon/50">
                {t("mesas.consumoPorComensal")}
              </h3>
              <ConsumptionTable bill={bill} />
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-xs text-carbon/60">
              {bill.session.splitMode
                ? t("mesa.modoElegido", { m: t(`mesa.modo.${bill.session.splitMode}`) })
                : t("mesas.sinModo")}
              {bill.session.splitMode === "iguales" && bill.session.parts
                ? ` · ${t("mesa.partesN", { n: bill.session.parts })}`
                : ""}
            </p>
            <PaymentRows bill={bill} actions={paymentActions} />
          </div>
        )}

        <div className="mt-4">
          <TableHistory sessionId={bill.session.id} version={bill.session.version} />
        </div>

        {cobrarOpen && (
          <CobrarModal
            bill={bill}
            settings={settings}
            employeeId={employeeId}
            onClose={() => setCobrarOpen(false)}
            onDone={onChanged}
          />
        )}
        {closeOpen && (
          <CloseTableModal
            bill={bill}
            employeeId={employeeId}
            onClose={() => setCloseOpen(false)}
            onClosed={() => {
              setCloseOpen(false);
              onChanged();
            }}
          />
        )}
      </section>
      <PrintableBill bill={bill} branchName={branchName} />
    </>
  );
};
