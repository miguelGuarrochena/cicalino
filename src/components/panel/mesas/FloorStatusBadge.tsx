"use client";

import { useApp } from "@/components/providers/Providers";
import type { FloorOpStatus } from "@/lib/tableOps";

export const FLOOR_STYLE: Record<
  FloorOpStatus,
  { bar: string; dot: string; text: string }
> = {
  "pedido-nuevo": {
    bar: "border-l-marca",
    dot: "bg-marca",
    text: "text-marca",
  },
  listo: {
    bar: "border-l-ok",
    dot: "bg-ok",
    text: "text-ok",
  },
  "esperando-pago": {
    bar: "border-l-curso",
    dot: "bg-curso",
    text: "text-curso",
  },
  pendiente: {
    bar: "border-l-alerta",
    dot: "bg-alerta",
    text: "text-alerta",
  },
  parcial: {
    bar: "border-l-curso",
    dot: "bg-curso",
    text: "text-curso",
  },
  preparando: {
    bar: "border-l-curso",
    dot: "bg-curso",
    text: "text-curso",
  },
  consumiendo: {
    bar: "border-l-carbon/30",
    dot: "bg-carbon/40",
    text: "text-carbon/65",
  },
  pagada: {
    bar: "border-l-ok",
    dot: "bg-ok",
    text: "text-ok",
  },
  "sin-consumo": {
    bar: "border-l-linea",
    dot: "bg-carbon/25",
    text: "text-carbon/50",
  },
  libre: {
    bar: "border-l-linea",
    dot: "bg-carbon/20",
    text: "text-carbon/45",
  },
  cerrada: {
    bar: "border-l-linea",
    dot: "bg-carbon/30",
    text: "text-carbon/45",
  },
};

export const FloorStatusBadge = ({ status }: { status: FloorOpStatus }) => {
  const { t } = useApp();
  const style = FLOOR_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${style.text}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${style.dot}`} />
      {t(`mesas.estadoOp.${status}`)}
    </span>
  );
};
