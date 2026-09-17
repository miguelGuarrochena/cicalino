"use client";

import { useApp } from "@/components/providers/Providers";
import type { FloorOpStatus } from "@/lib/tableOps";

export const FLOOR_STYLE: Record<
  FloorOpStatus,
  { bar: string; dot: string; text: string; chip: string }
> = {
  "pedido-nuevo": {
    bar: "border-l-marca",
    dot: "bg-marca",
    text: "text-marca",
    chip: "bg-marca/15",
  },
  llamado: {
    bar: "border-l-alerta",
    dot: "bg-alerta",
    text: "text-alerta",
    chip: "bg-alerta-fondo",
  },
  listo: {
    bar: "border-l-ok",
    dot: "bg-ok",
    text: "text-ok",
    chip: "bg-ok-fondo",
  },
  "esperando-pago": {
    bar: "border-l-curso",
    dot: "bg-curso",
    text: "text-curso",
    chip: "bg-curso-fondo",
  },
  pendiente: {
    bar: "border-l-alerta",
    dot: "bg-alerta",
    text: "text-alerta",
    chip: "bg-alerta-fondo",
  },
  parcial: {
    bar: "border-l-curso",
    dot: "bg-curso",
    text: "text-curso",
    chip: "bg-curso-fondo",
  },
  preparando: {
    bar: "border-l-curso",
    dot: "bg-curso",
    text: "text-curso",
    chip: "bg-curso-fondo",
  },
  consumiendo: {
    bar: "border-l-curso",
    dot: "bg-curso",
    text: "text-curso",
    chip: "bg-curso-fondo",
  },
  pagada: {
    bar: "border-l-ok",
    dot: "bg-ok",
    text: "text-ok",
    chip: "bg-ok-fondo",
  },
  "sin-consumo": {
    bar: "border-l-carbon/40",
    dot: "bg-carbon/45",
    text: "text-carbon/70",
    chip: "bg-carbon/10",
  },
  libre: {
    bar: "border-l-linea",
    dot: "bg-carbon/25",
    text: "text-carbon/45",
    chip: "bg-carbon/5",
  },
  cerrada: {
    bar: "border-l-linea",
    dot: "bg-carbon/30",
    text: "text-carbon/45",
    chip: "bg-carbon/5",
  },
};

export const FloorStatusBadge = ({ status }: { status: FloorOpStatus }) => {
  const { t } = useApp();
  const style = FLOOR_STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.chip} ${style.text}`}
    >
      <span aria-hidden className={`size-2 rounded-full ${style.dot}`} />
      {t(`mesas.estadoOp.${status}`)}
    </span>
  );
};
