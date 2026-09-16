"use client";

import { useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useToast } from "@/components/ui/Toast";
import {
  BillTotals,
  ConsumptionTable,
  PaymentRows,
} from "@/components/tables/BillParts";
import { StaffPaymentModal } from "@/components/panel/mesas/StaffPaymentModal";
import { CloseTableModal } from "@/components/panel/mesas/CloseTableModal";
import { updateOrderStatus } from "@/lib/data/orders";
import { cancelTablePayment, confirmTablePayment } from "@/lib/data/tables";
import {
  formatMoney,
  type BillOrder,
  type BillPayment,
  type PaymentSettings,
  type TableBill,
} from "@/lib/tableBill";
import type { OrderStatus } from "@/lib/types";

type Tab = "consumo" | "pagos";

export const TableDetail = ({
  bill,
  settings,
  employeeId,
  onChanged,
}: {
  bill: TableBill;
  settings: PaymentSettings;
  employeeId: string | null;
  onChanged: () => void;
}) => {
  const { t } = useApp();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("consumo");
  const [busy, setBusy] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const open = bill.session.status === "abierta";
  const names = new Map(bill.guests.map((g) => [g.id, g.name]));

  const run = async (id: string, fn: () => Promise<{ ok: boolean; reason?: string }>, okMsg: string) => {
    setBusy(id);
    const res = await fn();
    setBusy(null);
    if (res.ok) {
      toast(okMsg, "success");
      onChanged();
    } else {
      const key = `mesas.error.${res.reason ?? "error"}`;
      const txt = t(key);
      toast(txt === key ? t("mesas.error.error") : txt, "error");
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
      p.status === "pendiente" || (p.status === "pagado" && p.method !== "mercado_pago");
    if (!canConfirm && !canCancel) return null;
    return (
      <div className="flex flex-wrap gap-2">
        {canConfirm && (
          <button
            type="button"
            disabled={busy === p.id}
            onClick={() =>
              void run(p.id, () => confirmTablePayment(p.id, employeeId), t("mesas.pagoConfirmado"))
            }
            className="min-h-9 rounded-full bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
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
              void run(
                p.id,
                () => cancelTablePayment(p.id, motivo, employeeId),
                t("mesas.pagoCancelado"),
              );
            }}
            className="min-h-9 rounded-full border border-linea px-3 text-xs font-semibold text-carbon/70 disabled:opacity-50"
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
    <section className="rounded-[24px] border border-linea bg-surface p-4 shadow-sm sm:p-6">
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
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            open
              ? "bg-marca/10 text-marca"
              : bill.session.status === "pagada"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                : "bg-carbon/10 text-carbon/60"
          }`}
        >
          {t(`mesas.estado.${bill.session.status}`)}
        </span>
      </header>

      <div role="tablist" aria-label={t("mesas.vistas")} className="mt-4 flex rounded-2xl border border-linea bg-crema/40 p-1">
        {(["consumo", "pagos"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`min-h-10 flex-1 rounded-xl px-3 text-sm font-semibold transition ${
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
                          className="min-h-9 rounded-full bg-marca px-3 text-xs font-semibold text-crema disabled:opacity-50"
                        >
                          {t("mesas.marcarListo")}
                        </button>
                      )}
                      {o.status === "listo" && (
                        <button
                          type="button"
                          disabled={busy === o.id}
                          onClick={() => void moveOrder(o, "retirado")}
                          className="min-h-9 rounded-full bg-marca px-3 text-xs font-semibold text-crema disabled:opacity-50"
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
                        className="min-h-9 rounded-full border border-linea px-3 text-xs font-semibold text-carbon/70 disabled:opacity-50"
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
          <BillTotals bill={bill} />
          <p className="text-xs text-carbon/60">
            {bill.session.splitMode
              ? t("mesa.modoElegido", { m: t(`mesa.modo.${bill.session.splitMode}`) })
              : t("mesas.sinModo")}
            {bill.session.splitMode === "iguales" && bill.session.parts
              ? ` · ${t("mesa.partesN", { n: bill.session.parts })}`
              : ""}
            {bill.totals.uncovered > 0 && (
              <>
                {" · "}
                {t("mesas.faltaCubrirConsumo", { n: formatMoney(bill.totals.uncovered) })}
              </>
            )}
          </p>
          <PaymentRows bill={bill} actions={paymentActions} />
          {open && (
            <div className="flex flex-wrap gap-2 border-t border-linea pt-4">
              {bill.totals.available > 0 && (
                <button
                  type="button"
                  onClick={() => setRegisterOpen(true)}
                  className="min-h-11 rounded-full bg-marca px-5 text-sm font-semibold text-crema"
                >
                  {t("mesas.registrarPago")}
                </button>
              )}
              <button
                type="button"
                onClick={() => setCloseOpen(true)}
                className="min-h-11 rounded-full border border-linea px-5 text-sm font-semibold text-carbon/70"
              >
                {t("mesas.cerrarMesa")}
              </button>
            </div>
          )}
        </div>
      )}

      {registerOpen && (
        <StaffPaymentModal
          bill={bill}
          settings={settings}
          employeeId={employeeId}
          onClose={() => setRegisterOpen(false)}
          onSaved={() => {
            setRegisterOpen(false);
            onChanged();
          }}
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
  );
};
