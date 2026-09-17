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
import { FloorStatusBadge } from "@/components/panel/mesas/FloorStatusBadge";
import { updateOrderStatus } from "@/lib/data/orders";
import { cancelTablePayment, confirmTablePayment, acknowledgeWaiterCall } from "@/lib/data/tables";
import {
  billPending,
  formatMoney,
  type BillOrder,
  type BillPayment,
  type PaymentSettings,
  type TableBill,
} from "@/lib/tableBill";
import {
  floorStatus,
  guestAccountRows,
  kitchenOrders,
  summarizeKitchen,
} from "@/lib/tableOps";
import type { OrderStatus } from "@/lib/types";

export const TableDetail = ({
  bill,
  settings,
  branchName,
  employeeId,
  employeeName,
  canManage,
  onChanged,
  onBack,
  onShowQr,
  waiterName,
  waiterId,
  staff,
  onAssign,
}: {
  bill: TableBill;
  settings: PaymentSettings;
  branchName: string;
  employeeId: string | null;
  employeeName?: string | null;
  canManage: boolean;
  onChanged: () => void;
  onBack?: () => void;
  onShowQr?: () => void;
  waiterName?: string | null;
  waiterId?: string | null;
  staff?: { id: string; name: string }[];
  onAssign?: (employeeId: string | null) => Promise<{ ok: boolean; reason?: string }>;
}) => {
  const { t } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [cobrarOpen, setCobrarOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTo, setReassignTo] = useState(waiterId ?? "");
  const open = bill.session.status === "abierta";
  const names = new Map(bill.guests.map((g) => [g.id, g.name]));
  const pending = billPending(bill);
  const status = floorStatus(bill);
  const waitingPayments = bill.payments.filter(
    (p) => p.status === "pendiente" && p.method !== "mercado_pago",
  );
  const created = kitchenOrders(bill, "creado");
  const prep = kitchenOrders(bill, "en_preparacion");
  const ready = kitchenOrders(bill, "listo");
  const comanda = [...created, ...prep, ...ready];
  const accountRows = guestAccountRows(bill);

  const errorText = (reason?: string) => {
    for (const k of [`recepcion.error.${reason}`, `mesas.error.${reason}`, `mesa.error.${reason}`]) {
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
            className="min-h-10 rounded-full bg-ok px-4 text-xs font-semibold text-crema disabled:opacity-50"
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
              {waiterName
                ? t("recepcion.atendidaPor", { n: waiterName })
                : t("recepcion.sinAsignar")}
              {" · "}
              {t("mesas.abiertaDesde", {
                h: new Date(bill.session.openedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              })}{" "}
              · {t("mesas.comensalesN", { n: bill.guests.length })}
            </p>
          </div>
          <FloorStatusBadge status={status} />
        </header>

        {open && bill.session.calledAt && (
          <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-alerta/40 bg-alerta/10 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-alerta">{t("mesas.teLlaman")}</p>
            <button
              type="button"
              disabled={busy === "llamado"}
              onClick={() =>
                void run("llamado", () => acknowledgeWaiterCall(bill.session.id), t("mesas.llamadoAtendido"))
              }
              className="min-h-11 rounded-full bg-alerta px-5 text-sm font-semibold text-crema disabled:opacity-50"
            >
              {t("mesas.yaVoy")}
            </button>
          </div>
        )}

        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          {(
            [
              ["mesa.total", bill.totals.total, "text-carbon"],
              ["mesa.pagado", bill.totals.paid, "text-ok"],
              ["mesa.pendiente", pending, pending > 0 ? "text-alerta" : "text-carbon/50"],
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

        <div className="mt-4 flex flex-col gap-2">
          {open && pending > 0 && (
            <button
              type="button"
              onClick={() => setCobrarOpen(true)}
              className="min-h-12 w-full rounded-full bg-marca px-6 text-base font-semibold text-crema transition hover:bg-marca-fuerte active:scale-[0.98]"
            >
              {t("mesas.cobrar")} · {formatMoney(pending)}
            </button>
          )}
          {onShowQr && (
            <button
              type="button"
              onClick={onShowQr}
              className="min-h-11 w-full rounded-full border border-marca px-6 text-sm font-semibold text-marca"
            >
              {t("mesas.verQrMesa")}
            </button>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {onAssign && canManage && (
              <button
                type="button"
                onClick={() => {
                  setReassignTo(waiterId ?? "");
                  setReassignOpen((v) => !v);
                }}
                className="min-h-11 text-sm font-semibold text-carbon/60 underline-offset-4 hover:text-carbon hover:underline"
              >
                {t("recepcion.reasignar")}
              </button>
            )}
            {onAssign && !canManage && !waiterId && employeeId && (
              <button
                type="button"
                disabled={busy === "tomar"}
                onClick={() =>
                  void run("tomar", () => onAssign(employeeId), t("recepcion.asignado"))
                }
                className="min-h-11 text-sm font-semibold text-marca underline-offset-4 hover:underline disabled:opacity-50"
              >
                {t("recepcion.tomar")}
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-11 text-sm font-semibold text-carbon/60 underline-offset-4 hover:text-carbon hover:underline"
            >
              {t("mesas.imprimirCuenta")}
            </button>
            {open && (pending <= 0 || canManage) && (
              <button
                type="button"
                onClick={() => setCloseOpen(true)}
                className="min-h-11 text-sm font-semibold text-carbon/60 underline-offset-4 hover:text-carbon hover:underline"
              >
                {t("mesas.cerrarMesa")}
              </button>
            )}
          </div>
          {reassignOpen && onAssign && staff && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
                className="min-h-11 flex-1 rounded-xl border border-linea bg-crema/40 px-3 text-sm text-carbon outline-none focus:border-marca focus:ring-2 focus:ring-marca/20"
              >
                <option value="">{t("recepcion.sinAsignar")}</option>
                {staff.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy === "reasignar"}
                onClick={() =>
                  void run(
                    "reasignar",
                    async () => {
                      const res = await onAssign(reassignTo || null);
                      if (res.ok) setReassignOpen(false);
                      return res;
                    },
                    t("recepcion.asignado"),
                  )
                }
                className="min-h-11 rounded-full bg-marca px-4 text-sm font-semibold text-crema disabled:opacity-50"
              >
                {t("recepcion.asignar")}
              </button>
            </div>
          )}
        </div>

        {waitingPayments.length > 0 && (
          <div className="mt-4 rounded-2xl border border-curso-borde bg-curso-fondo p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-curso">
              {t("mesas.esperandoConfirmacion")}
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {waitingPayments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 text-sm">
                    <span className="font-semibold text-carbon">{p.payerName}</span>{" "}
                    <span className="tabular-nums">{formatMoney(p.total)}</span>
                  </span>
                  {paymentActions(p)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {comanda.length > 0 && (
          <section className="mt-6 border-t border-linea pt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-marca">{t("mesas.comanda")}</h3>
            <p className="mt-1 text-xs text-carbon/55">{t("mesas.inboxAyuda")}</p>
            <p className="mt-1 text-sm text-carbon/70">
              {summarizeKitchen(comanda)
                .map((l) => `${l.quantity} × ${l.name}`)
                .join(" · ")}
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {comanda.map((o) => (
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
                  <div className="mt-3 flex flex-col gap-2">
                    {o.status === "creado" && (
                      <button
                        type="button"
                        disabled={busy === o.id}
                        onClick={() => void moveOrder(o, "en_preparacion")}
                        className="min-h-12 w-full rounded-full bg-marca px-4 text-sm font-semibold text-crema disabled:opacity-50"
                      >
                        {t("mesas.pasarAComanda")}
                      </button>
                    )}
                    {(o.status === "creado" || o.status === "en_preparacion") && (
                      <button
                        type="button"
                        disabled={busy === o.id}
                        onClick={() => void moveOrder(o, "listo")}
                        className={`min-h-12 w-full rounded-full px-4 text-sm font-semibold disabled:opacity-50 ${
                          o.status === "creado"
                            ? "border border-linea text-carbon/70"
                            : "bg-marca text-crema"
                        }`}
                      >
                        {t("mesas.marcarListo")}
                      </button>
                    )}
                    {o.status === "listo" && (
                      <button
                        type="button"
                        disabled={busy === o.id}
                        onClick={() => void moveOrder(o, "retirado")}
                        className="min-h-12 w-full rounded-full bg-marca px-4 text-sm font-semibold text-crema disabled:opacity-50"
                      >
                        {t("mesas.marcarEntregado")}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy === o.id}
                      onClick={() => {
                        const msg =
                          o.status === "creado"
                            ? t("mesas.cancelarPedidoConfirmar")
                            : t("mesas.cancelarPedidoAnotadoConfirmar");
                        if (window.confirm(msg)) {
                          void moveOrder(o, "cancelado");
                        }
                      }}
                      className="min-h-11 w-full rounded-full border border-transparent px-4 text-sm font-semibold text-red-600 hover:border-red-300 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      {t("mesas.cancelarPedido")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-6 border-t border-linea pt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-carbon/50">
            {t("mesas.cuenta")}
          </h3>
          <ul className="mt-3 flex flex-col gap-1.5">
            {accountRows.map((r) => (
              <li
                key={r.guest.id}
                className="flex items-baseline justify-between gap-3 rounded-xl px-1 py-1 text-sm"
              >
                <span className="truncate font-semibold text-carbon">{r.guest.name}</span>
                <span className="shrink-0 tabular-nums text-carbon/80">
                  {formatMoney(r.consumption)}
                  <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-carbon/45">
                    {t(`mesas.cuentaPersona.${r.status}`)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {bill.totals.consumption > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-carbon/45">
                {t("mesas.consumoPorComensal")}
              </h4>
              <ConsumptionTable bill={bill} />
            </div>
          )}
          <div className="mt-4">
            <p className="mb-2 text-xs text-carbon/60">
              {bill.session.splitMode
                ? t("mesa.modoElegido", { m: t(`mesa.modo.${bill.session.splitMode}`) })
                : t("mesas.sinModo")}
              {bill.session.splitMode === "iguales" && bill.session.parts
                ? ` · ${t("mesa.partesN", { n: bill.session.parts })}`
                : ""}
            </p>
            <PaymentRows bill={bill} actions={paymentActions} />
          </div>
        </section>

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
      <PrintableBill bill={bill} branchName={branchName} employeeName={employeeName} />
    </>
  );
};
