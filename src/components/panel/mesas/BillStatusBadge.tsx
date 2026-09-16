"use client";

import { useApp } from "@/components/providers/Providers";
import { billStatus, type BillStatus, type TableBill } from "@/lib/tableBill";

export const STATUS_STYLE: Record<BillStatus, { dot: string; chip: string }> = {
  pendiente: {
    dot: "bg-red-500",
    chip: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
  },
  parcial: {
    dot: "bg-amber-400",
    chip: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  },
  pagada: {
    dot: "bg-emerald-500",
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  },
  "sin-consumo": {
    dot: "bg-carbon/25",
    chip: "bg-carbon/10 text-carbon/60",
  },
  cerrada: {
    dot: "bg-carbon/40",
    chip: "bg-carbon/10 text-carbon/60",
  },
};

/* 🔴 pending · 🟡 partly paid · 🟢 paid. Color plus a text label, so it
 * reads without relying on color alone. */
export const BillStatusBadge = ({ bill }: { bill: TableBill }) => {
  const { t } = useApp();
  const status = billStatus(bill);
  const style = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${style.chip}`}>
      <span aria-hidden className={`size-2 rounded-full ${style.dot}`} />
      {t(`mesas.estadoCobro.${status}`)}
    </span>
  );
};
