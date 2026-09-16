"use client";

import { useApp } from "@/components/providers/Providers";
import {
  consumptionByGuest,
  formatMoney,
  type TableBill,
} from "@/lib/tableBill";

const Line = ({ label, value, strong }: { label: string; value: number; strong?: boolean }) => (
  <div className={`flex justify-between gap-2 ${strong ? "font-bold" : ""}`}>
    <span className="min-w-0 break-words">{label}</span>
    <span className="shrink-0 tabular-nums">{formatMoney(value)}</span>
  </div>
);

/* Paper copy of a table bill, for places without tablets or where the waiter
 * prefers to bring the bill to the table.
 *
 * Plain browser printing: hidden on screen, the only thing visible when
 * printing (print: classes). Narrow and monospaced so it fits an 80 mm thermal
 * roll through the regular print dialog, and still reads fine on A4. It's a
 * snapshot of the database at print time, not the bill itself, and it says so. */
export const PrintableBill = ({
  bill,
  branchName,
  employeeName,
}: {
  bill: TableBill;
  branchName: string;
  employeeName?: string | null;
}) => {
  const { t } = useApp();
  const guests = consumptionByGuest(bill).filter((g) => g.lines.length > 0);
  const active = bill.payments.filter((p) => p.status !== "cancelado");
  const tipOf = (guestId: string | null) =>
    active.filter((p) => p.guestId === guestId).reduce((s, p) => s + p.tip, 0);
  const extras = active.filter((p) => !p.guestId && (p.tip > 0 || p.surcharge > 0));
  const pending = Math.max(bill.totals.total - bill.totals.paid, 0);

  return (
    <div
      className="hidden w-[72mm] max-w-full bg-white font-mono text-[12px] leading-snug text-black print:block"
      aria-hidden
    >
      <p className="text-center text-sm font-bold uppercase">{branchName || "Cicalino"}</p>
      <p className="text-center text-base font-bold uppercase">
        {t("mesa.mesaN", { n: bill.session.tableNumber })}
      </p>
      <p className="text-center">{new Date().toLocaleString()}</p>
      <hr className="my-2 border-dashed border-black" />

      {guests.map((g) => (
        <div key={g.guest.id} className="mb-2">
          <p className="font-bold">{g.guest.name}</p>
          {g.lines.map((l) => (
            <Line
              key={`${l.name}:${l.unitPrice}`}
              label={l.quantity > 1 ? `${l.quantity} x ${l.name}` : l.name}
              value={l.subtotal}
            />
          ))}
          <Line label={t("mesa.subtotal")} value={g.subtotal} strong />
          {tipOf(g.guest.id) > 0 && <Line label={t("mesa.propinaTitulo")} value={tipOf(g.guest.id)} />}
        </div>
      ))}

      {extras.map((p) => (
        <div key={p.id}>
          {p.tip > 0 && <Line label={`${t("mesa.propinaTitulo")} (${p.payerName})`} value={p.tip} />}
          {p.surcharge > 0 && (
            <Line label={t("mesa.lineaRecargo", { n: p.surchargePercent })} value={p.surcharge} />
          )}
        </div>
      ))}

      <hr className="my-2 border-dashed border-black" />
      <Line label={t("mesa.total").toUpperCase()} value={bill.totals.total} strong />
      <Line label={t("mesa.pagado").toUpperCase()} value={bill.totals.paid} />
      <Line label={t("mesa.pendiente").toUpperCase()} value={pending} strong />

      {active.length > 0 && (
        <>
          <hr className="my-2 border-dashed border-black" />
          {active.map((p) => (
            <div key={p.id} className="flex justify-between gap-2">
              <span className="min-w-0">
                {p.payerName} · {t(`mesa.metodo.${p.method}`)} ·{" "}
                {p.status === "pagado" ? t("mesa.estadoPago.pagado") : t("mesa.estadoPago.pendiente")}
              </span>
              <span className="shrink-0 tabular-nums">{formatMoney(p.total)}</span>
            </div>
          ))}
        </>
      )}

      {pending > 0 && (
        <>
          <hr className="my-2 border-dashed border-black" />
          <p>{t("mesas.imprimirMetodo")} ____________</p>
          <p className="mt-2">
            {t("mesas.imprimirEmpleado")} {employeeName ? employeeName : "____________"}
          </p>
        </>
      )}
      <hr className="my-2 border-dashed border-black" />
      <p className="text-center text-[11px]">{t("mesas.imprimirNoFactura")}</p>
    </div>
  );
};
