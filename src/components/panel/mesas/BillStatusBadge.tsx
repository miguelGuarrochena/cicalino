"use client";

import { useApp } from "@/components/providers/Providers";
import { billStatus, type BillStatus, type TableBill } from "@/lib/tableBill";

export const STATUS_STYLE: Record<BillStatus, { dot: string; chip: string; ring: string }> = {
  pendiente: {
    dot: "bg-alerta",
    chip: "bg-alerta-fondo text-alerta",
    ring: "border-alerta-borde",
  },
  parcial: {
    dot: "bg-curso",
    chip: "bg-curso-fondo text-curso",
    ring: "border-curso-borde",
  },
  pagada: {
    dot: "bg-ok",
    chip: "bg-ok-fondo text-ok",
    ring: "border-ok-borde",
  },
  "sin-consumo": {
    dot: "bg-carbon/25",
    chip: "bg-carbon/10 text-carbon/60",
    ring: "border-linea",
  },
  cerrada: {
    dot: "bg-carbon/40",
    chip: "bg-carbon/10 text-carbon/60",
    ring: "border-linea",
  },
};

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
