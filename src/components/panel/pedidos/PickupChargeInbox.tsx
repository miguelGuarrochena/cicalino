"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { fetchPaymentSettings } from "@/lib/data/tables";
import {
  cancelUnpaidOrder,
  chargePickupOrder,
  type CounterChargeMethod,
} from "@/lib/data/pickup";
import {
  DEFAULT_PAYMENT_SETTINGS,
  enabledMethods,
  formatMoney,
  type PaymentSettings,
} from "@/lib/tableBill";
import { pickupPaying, type PickupOrder } from "@/lib/tablePickup";

/* "Por cobrar": los pedidos de las mesas que esperan el pago.
 *
 * Es el aviso de la caja. Arriba, los que eligieron pagar en caja (van a
 * acercarse); abajo, los que están pagando con Mercado Pago, por si el
 * cliente viene igual a pagar. Cobrar es lo que los manda a preparación. */
export const PickupChargeInbox = ({
  branchId,
  orders,
  employeeId,
  onChanged,
}: {
  branchId: string;
  orders: PickupOrder[];
  employeeId: string | null;
  onChanged: () => void;
}) => {
  const { t } = useApp();
  const toast = useToast();
  const confirmar = useConfirm();
  const [settings, setSettings] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);
  const [charging, setCharging] = useState<PickupOrder | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchPaymentSettings(branchId).then((r) => {
      if (alive && r.ok) setSettings(r.data.settings);
    });
    return () => {
      alive = false;
    };
  }, [branchId]);

  if (!orders.length) return null;

  const methods = enabledMethods(settings, { mercadoPagoConnected: false, forStaff: true }).filter(
    (m): m is CounterChargeMethod => m !== "mercado_pago",
  );
  const enCaja = orders.filter((o) => pickupPaying(o) === "caja").length;

  const cancel = async (o: PickupOrder) => {
    const ok = await confirmar({
      title: t("retiroCaja.cancelarTitulo", { n: o.reference }),
      body: t("retiroCaja.cancelarCuerpo"),
      confirmLabel: t("retiroCaja.cancelarSi"),
      cancelLabel: t("acciones.volver"),
      tone: "peligro",
    });
    if (!ok) return;
    setBusy(o.id);
    const res = await cancelUnpaidOrder(o.id);
    setBusy(null);
    if (!res.ok) {
      toast(t("retiroCaja.errorCancelar"), "error");
    } else {
      toast(t("retiroCaja.cancelado", { n: o.reference }), "info");
    }
    onChanged();
  };

  return (
    <section
      aria-labelledby="por-cobrar"
      className="rounded-2xl border border-curso-borde bg-curso-fondo/60 p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="por-cobrar" className="text-xs font-semibold uppercase tracking-wide text-curso">
          {t("retiroCaja.titulo")}
          <span className="ml-1.5 tabular-nums text-curso/70">{orders.length}</span>
        </h2>
        {enCaja > 0 && (
          <p className="text-xs font-semibold text-curso">{t("retiroCaja.vienenN", { n: enCaja })}</p>
        )}
      </div>
      <p className="mt-1 text-sm text-carbon/60">{t("retiroCaja.ayuda")}</p>
      <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {orders.map((o) => {
          const paying = pickupPaying(o);
          return (
            <li
              key={o.id}
              className={`flex flex-col gap-3 rounded-2xl bg-surface p-4 ${
                paying === "caja" ? "u-alert-halo" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-carbon/45">
                    {t("retiroCaja.pedidoDeMesa", { n: o.tableNumber ?? "—" })}
                  </p>
                  <p className="font-display text-3xl leading-none text-carbon">
                    {o.reference}
                    {o.alias ? (
                      <span className="ml-2 font-display text-lg text-marca">{o.alias}</span>
                    ) : null}
                  </p>
                </div>
                <p className="shrink-0 font-display text-2xl tabular-nums text-carbon">
                  {formatMoney(o.total)}
                </p>
              </div>
              <span
                className={`self-start rounded-full px-2.5 py-1 text-xs font-semibold ${
                  paying === "caja"
                    ? "bg-curso text-crema"
                    : "border border-linea text-carbon/60"
                }`}
              >
                {t(`retiroCaja.eligio.${paying}`)}
              </span>
              <ul className="flex flex-col gap-0.5 text-sm text-carbon/75">
                {o.items.map((i) => (
                  <li key={i.id}>
                    <span className="font-semibold tabular-nums">{i.quantity} ×</span> {i.name}
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={busy === o.id}
                  onClick={() => setCharging(o)}
                  className="min-h-11 flex-1 rounded-full bg-marca px-4 text-sm font-semibold text-crema disabled:opacity-50"
                >
                  {t("retiroCaja.cobrar", { n: formatMoney(o.total) })}
                </button>
                <button
                  type="button"
                  disabled={busy === o.id}
                  onClick={() => void cancel(o)}
                  className="min-h-11 rounded-full px-3 text-sm font-semibold text-alerta hover:bg-alerta-fondo disabled:opacity-50"
                >
                  {t("retiroCaja.cancelar")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {charging && (
        <ChargeModal
          order={charging}
          methods={methods}
          employeeId={employeeId}
          onClose={() => setCharging(null)}
          onDone={(repeated) => {
            toast(
              repeated
                ? t("retiroCaja.yaCobrado", { n: charging.reference })
                : t("retiroCaja.cobrado", { n: charging.reference }),
              "success",
            );
            setCharging(null);
            onChanged();
          }}
        />
      )}
    </section>
  );
};

const ChargeModal = ({
  order,
  methods,
  employeeId,
  onClose,
  onDone,
}: {
  order: PickupOrder;
  methods: CounterChargeMethod[];
  employeeId: string | null;
  onClose: () => void;
  onDone: (repeated: boolean) => void;
}) => {
  const { t } = useApp();
  const [method, setMethod] = useState<CounterChargeMethod | null>(methods[0] ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mpEnCurso = pickupPaying(order) === "mercado_pago";

  const cobrar = async () => {
    if (!method || busy) return;
    setBusy(true);
    setError(null);
    const res = await chargePickupOrder(order.id, method, employeeId);
    setBusy(false);
    if (!res.ok) {
      const key = `retiroCaja.error.${res.reason}`;
      const txt = t(key);
      setError(txt === key ? t("retiroCaja.error.error") : txt);
      return;
    }
    onDone(res.repeated);
  };

  return (
    <ModalShell
      onClose={() => {
        if (!busy) onClose();
      }}
      labelledBy="cobrar-pedido"
      busy={busy}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={busy || !method}
            onClick={() => void cobrar()}
            className="min-h-12 w-full rounded-full bg-marca px-4 text-sm font-semibold text-crema disabled:opacity-50 sm:flex-1"
          >
            {busy ? "…" : t("retiroCaja.confirmarCobro", { n: formatMoney(order.total) })}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-12 w-full rounded-full border border-linea px-4 text-sm font-semibold text-carbon disabled:opacity-50 sm:flex-1"
          >
            {t("acciones.volver")}
          </button>
        </div>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-carbon/45">
            {t("retiroCaja.pedidoDeMesa", { n: order.tableNumber ?? "—" })}
          </p>
          <h3 id="cobrar-pedido" className="font-display text-2xl uppercase tracking-tight text-carbon">
            {t("retiroCaja.cobrarTitulo", { n: order.reference })}
          </h3>
        </div>
        <ModalCloseBtn disabled={busy} label={t("qr.cerrar")} onClick={onClose} />
      </div>
      <p className="mt-3 flex items-baseline justify-between gap-2 text-sm font-semibold text-carbon">
        {t("retiroCaja.total")}
        <span className="font-display text-3xl tabular-nums text-marca">{formatMoney(order.total)}</span>
      </p>
      {mpEnCurso && (
        <p className="mt-3 rounded-xl border border-curso-borde bg-curso-fondo px-3 py-2 text-sm text-curso">
          {t("retiroCaja.mpEnCurso")}
        </p>
      )}
      <p className="mt-4 text-sm font-medium text-carbon/70">{t("retiroCaja.comoPago")}</p>
      {methods.length ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {methods.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={method === m}
              onClick={() => setMethod(m)}
              className={`min-h-12 rounded-2xl border px-3 text-sm font-semibold transition ${
                method === m
                  ? "border-marca bg-marca/10 text-carbon ring-2 ring-marca/30"
                  : "border-linea bg-crema/30 text-carbon/70"
              }`}
            >
              {t(`mesa.metodo.${m}`)}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-alerta">{t("retiroCaja.sinMetodos")}</p>
      )}
      <p className="mt-3 text-xs text-carbon/50">{t("retiroCaja.alCobrar")}</p>
      {error && <p className="mt-3 text-sm font-medium text-alerta">{error}</p>}
    </ModalShell>
  );
};
