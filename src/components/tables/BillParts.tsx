"use client";

import { useApp } from "@/components/providers/Providers";
import { CustomerEmpty } from "@/components/customer/CustomerEmpty";
import {
  consumptionByGuest,
  formatMoney,
  paymentsByPayer,
  type BillPayment,
  type TableBill,
} from "@/lib/tableBill";

/* Pieces of a table bill shown the same way to guests and staff.
 *
 * "Consumo" answers what each person ordered. "Pagos" answers how much is
 * paid and what's missing. They're separate components on purpose: neither
 * view mixes in the other's numbers. */

export const PaymentStatusBadge = ({ payment }: { payment: BillPayment }) => {
  const { t } = useApp();
  const excess = payment.mpStatus === "excedente";
  const cls = excess
    ? "border-alerta-borde bg-alerta-fondo text-alerta"
    : payment.status === "pagado"
      ? "border-ok-borde bg-ok-fondo text-carbon"
      : payment.status === "pendiente" || payment.status === "definido"
        ? "border-curso-borde bg-curso-fondo text-carbon"
        : "border-linea bg-carbon/5 text-suave";
  const icon = excess
    ? "!"
    : payment.status === "pagado"
      ? "✓"
      : payment.status === "pendiente" || payment.status === "definido"
        ? "⏳"
        : "✕";
  const label = excess
    ? t("mesa.estadoPago.excedente")
    : payment.status === "pendiente" && payment.method === "mercado_pago"
      ? t("mesa.estadoPago.verificandoMp")
      : t(`mesa.estadoPago.${payment.status}`);
  return (
    <span
      className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold ${cls}`}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
};

export const ConsumptionTable = ({
  bill,
  highlightGuestId,
}: {
  bill: TableBill;
  highlightGuestId?: string | null;
}) => {
  const { t } = useApp();
  const groups = consumptionByGuest(bill).filter((g) => g.lines.length > 0);

  if (!groups.length) {
    return <CustomerEmpty titulo={t("mesa.sinConsumo")} cuerpo={t("mesa.sinConsumoAyuda")} />;
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <section
          key={g.guest.id}
          className={`rounded-2xl border bg-surface p-3.5 ${
            g.guest.id === highlightGuestId ? "border-marca/50" : "border-linea"
          }`}
        >
          <h3 className="mb-2.5 flex items-baseline justify-between gap-2 text-lg font-semibold text-carbon">
            <span className="truncate">
              {g.guest.name}
              {g.guest.id === highlightGuestId && (
                <span className="ml-1.5 text-base font-medium text-marca">{t("mesa.vos")}</span>
              )}
            </span>
          </h3>
          {/* Era una tabla de cuatro columnas con cabeceras de 11 px. En un
              teléfono de 375 px al nombre del producto le quedaban 134 px, y
              para llegar a 14 px de fuente no hay forma de que entren las
              cuatro. Ahora cada línea ocupa dos renglones: qué es arriba,
              cuánto abajo. Se lee igual en la tablet del panel. */}
          <ul className="flex flex-col">
            {g.lines.map((l) => (
              <li
                key={`${l.name}:${l.unitPrice}`}
                className="flex items-start justify-between gap-3 border-t border-linea/60 py-2.5 first:border-t-0 first:pt-0"
              >
                <div className="min-w-0">
                  <p className="text-base leading-snug text-carbon">{l.name}</p>
                  <p className="mt-0.5 text-sm tabular-nums text-suave">
                    {l.quantity} × {formatMoney(l.unitPrice)}
                  </p>
                </div>
                <span className="shrink-0 text-base font-semibold tabular-nums text-carbon">
                  {formatMoney(l.subtotal)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 flex items-baseline justify-between gap-3 border-t border-linea pt-2.5 text-base font-semibold text-carbon">
            <span className="min-w-0 truncate">{t("mesa.subtotalDe", { n: g.guest.name })}</span>
            <span className="shrink-0 tabular-nums">{formatMoney(g.subtotal)}</span>
          </p>
        </section>
      ))}
      <p className="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl bg-marca/10 px-4 py-3.5 text-base font-semibold text-carbon">
        {t("mesa.totalConsumo")}
        <span className="font-display text-2xl tabular-nums text-marca">
          {formatMoney(bill.totals.consumption)}
        </span>
      </p>
    </div>
  );
};

export const BillTotals = ({ bill }: { bill: TableBill }) => {
  const { t } = useApp();
  const pending = Math.max(bill.totals.total - bill.totals.paid, 0);
  return (
    <dl className="grid grid-cols-3 gap-2 text-center">
      {(
        [
          ["mesa.total", bill.totals.total, "text-carbon"],
          ["mesa.pagado", bill.totals.paid, "text-ok"],
          ["mesa.pendiente", pending, pending > 0 ? "text-curso" : "text-suave"],
        ] as const
      ).map(([k, v, cls]) => (
        <div key={k} className="rounded-2xl border border-linea bg-surface px-2 py-3">
          <dt className="text-sm font-semibold uppercase tracking-wide text-suave">{t(k)}</dt>
          <dd className={`mt-1 font-display text-xl tabular-nums sm:text-2xl ${cls}`}>
            {formatMoney(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
};

export const PaymentRows = ({
  bill,
  highlightGuestId,
  actions,
}: {
  bill: TableBill;
  highlightGuestId?: string | null;
  actions?: (p: BillPayment) => React.ReactNode;
}) => {
  const { t } = useApp();
  const rows = paymentsByPayer(bill);
  if (!rows.length) {
    return <CustomerEmpty titulo={t("mesa.sinPagos")} cuerpo={t("mesa.sinPagosAyuda")} />;
  }
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li
          key={r.key}
          className={`rounded-2xl border bg-surface p-3.5 ${
            r.guestId && r.guestId === highlightGuestId ? "border-marca/50" : "border-linea"
          }`}
        >
          <p className="flex items-baseline justify-between gap-2 text-lg font-semibold text-carbon">
            <span className="truncate">{r.name}</span>
            {!r.payments.length && (
              <span className="shrink-0 text-sm font-medium text-suave">{t("mesa.sinPagar")}</span>
            )}
          </p>
          {r.payments.length > 0 && (
            <ul className="mt-2.5 flex flex-col gap-2.5">
              {r.payments.map((p) => (
                <li key={p.id} className="flex flex-col gap-2 border-t border-linea/60 pt-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                    <span
                      className={`text-lg font-semibold tabular-nums ${
                        p.status === "cancelado" ? "text-suave line-through" : "text-carbon"
                      }`}
                    >
                      {formatMoney(p.total)}
                    </span>
                    <span className="text-sm text-suave">{t(`mesa.metodo.${p.method}`)}</span>
                    <PaymentStatusBadge payment={p} />
                  </div>
                  {(p.tip > 0 || p.surcharge > 0) && p.status !== "cancelado" && (
                    <p className="text-sm text-suave">
                      {t("mesa.desglose", {
                        base: formatMoney(p.base),
                        propina: formatMoney(p.tip),
                        recargo: formatMoney(p.surcharge),
                      })}
                    </p>
                  )}
                  {actions?.(p)}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
};
