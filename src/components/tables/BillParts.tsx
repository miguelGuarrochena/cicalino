"use client";

import { useApp } from "@/components/providers/Providers";
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
  const cls =
    payment.status === "pagado"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
      : payment.status === "pendiente"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
        : "bg-carbon/10 text-carbon/55";
  const icon = payment.status === "pagado" ? "✓" : payment.status === "pendiente" ? "⏳" : "✕";
  const label =
    payment.status === "pendiente" && payment.method === "mercado_pago"
      ? t("mesa.estadoPago.verificandoMp")
      : t(`mesa.estadoPago.${payment.status}`);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}
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
    return <p className="py-6 text-center text-sm text-carbon/55">{t("mesa.sinConsumo")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <section
          key={g.guest.id}
          className={`rounded-2xl border bg-surface p-3 ${
            g.guest.id === highlightGuestId ? "border-marca/50" : "border-linea"
          }`}
        >
          <h3 className="mb-2 flex items-baseline justify-between gap-2 text-sm font-semibold text-carbon">
            <span className="truncate">
              {g.guest.name}
              {g.guest.id === highlightGuestId && (
                <span className="ml-1.5 text-xs font-medium text-marca">{t("mesa.vos")}</span>
              )}
            </span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-carbon/45">
                  <th className="pb-1 font-medium">{t("mesa.producto")}</th>
                  <th className="pb-1 text-right font-medium">{t("mesa.cant")}</th>
                  <th className="pb-1 text-right font-medium">{t("mesa.unitario")}</th>
                  <th className="pb-1 text-right font-medium">{t("mesa.subtotal")}</th>
                </tr>
              </thead>
              <tbody>
                {g.lines.map((l) => (
                  <tr key={`${l.name}:${l.unitPrice}`} className="border-t border-linea/60">
                    <td className="py-1.5 pr-2 text-carbon/80">{l.name}</td>
                    <td className="py-1.5 text-right tabular-nums text-carbon/70">{l.quantity}</td>
                    <td className="py-1.5 text-right tabular-nums text-carbon/60">
                      {formatMoney(l.unitPrice)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-carbon">
                      {formatMoney(l.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-linea">
                  <td colSpan={3} className="pt-1.5 text-xs font-semibold text-carbon/60">
                    {t("mesa.subtotalDe", { n: g.guest.name })}
                  </td>
                  <td className="pt-1.5 text-right font-semibold tabular-nums text-carbon">
                    {formatMoney(g.subtotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      ))}
      <p className="flex items-baseline justify-between rounded-2xl bg-marca/10 px-4 py-3 text-sm font-semibold text-carbon">
        {t("mesa.totalConsumo")}
        <span className="font-display text-xl tabular-nums text-marca">
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
          ["mesa.pagado", bill.totals.paid, "text-emerald-700 dark:text-emerald-300"],
          ["mesa.pendiente", pending, pending > 0 ? "text-amber-700 dark:text-amber-300" : "text-carbon/60"],
        ] as const
      ).map(([k, v, cls]) => (
        <div key={k} className="rounded-2xl border border-linea bg-surface px-2 py-2.5">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-carbon/50">{t(k)}</dt>
          <dd className={`mt-0.5 font-display text-lg tabular-nums sm:text-xl ${cls}`}>
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
    return <p className="py-4 text-center text-sm text-carbon/55">{t("mesa.sinPagos")}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li
          key={r.key}
          className={`rounded-2xl border bg-surface p-3 ${
            r.guestId && r.guestId === highlightGuestId ? "border-marca/50" : "border-linea"
          }`}
        >
          <p className="flex items-baseline justify-between gap-2 text-sm font-semibold text-carbon">
            <span className="truncate">{r.name}</span>
            {!r.payments.length && (
              <span className="text-xs font-medium text-carbon/45">{t("mesa.sinPagar")}</span>
            )}
          </p>
          {r.payments.length > 0 && (
            <ul className="mt-2 flex flex-col gap-2">
              {r.payments.map((p) => (
                <li key={p.id} className="flex flex-col gap-1.5 border-t border-linea/60 pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span
                      className={`font-semibold tabular-nums ${
                        p.status === "cancelado" ? "text-carbon/40 line-through" : "text-carbon"
                      }`}
                    >
                      {formatMoney(p.total)}
                    </span>
                    <span className="text-xs text-carbon/60">{t(`mesa.metodo.${p.method}`)}</span>
                    <PaymentStatusBadge payment={p} />
                  </div>
                  {(p.tip > 0 || p.surcharge > 0) && p.status !== "cancelado" && (
                    <p className="text-[11px] text-carbon/50">
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
