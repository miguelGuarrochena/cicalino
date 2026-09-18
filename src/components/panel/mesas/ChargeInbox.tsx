"use client";

import { useApp } from "@/components/providers/Providers";
import type { FloorTable } from "@/lib/tableOps";

export const ChargeInbox = ({
  rows,
  newPaymentIds,
  busy,
  onOpen,
}: {
  rows: FloorTable[];
  newPaymentIds: ReadonlySet<string>;
  busy: string | null;
  onOpen: (row: FloorTable) => void;
}) => {
  const { t } = useApp();
  if (!rows.length) return null;
  const anyNew = rows.some((row) => row.billRequests.some((p) => newPaymentIds.has(p.id)));

  return (
    <section className="rounded-2xl border border-alerta/30 bg-alerta/5 p-3 sm:p-4 print:hidden">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-alerta">
        {t("mesas.cuentasInbox")}
        <span className="ml-1.5 tabular-nums text-alerta/70">{rows.length}</span>
      </h2>
      {anyNew ? (
        <p className="mt-1 text-sm text-carbon/60">{t("mesas.cuentasAyuda")}</p>
      ) : null}
      <ul className="mt-3 flex flex-col gap-3">
        {rows.map((row) => {
          const isNew = row.billRequests.some((p) => newPaymentIds.has(p.id));
          return (
            <li key={row.key} className="rounded-2xl bg-surface p-4">
              <p className="font-display text-2xl uppercase leading-none text-carbon">
                {t("mesa.mesaN", { n: row.tableNumber })}
              </p>
              <p
                className={`mt-2 text-sm font-semibold ${
                  isNew ? "text-alerta" : "text-carbon/70"
                }`}
              >
                {isNew ? t("mesas.solicitaCuenta") : t("mesas.cuentaSolicitada")}
              </p>
              <button
                type="button"
                disabled={busy === row.key}
                onClick={() => onOpen(row)}
                className="mt-4 flex min-h-12 w-full items-center justify-center rounded-full bg-marca px-5 text-base font-semibold text-crema disabled:opacity-50"
              >
                {t("mesas.verMesa")}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
