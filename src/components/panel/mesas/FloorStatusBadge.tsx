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

/* On the filled floor tiles a tinted chip disappears and a veil-chip fights
 * the amount. There the colour of the tile is the chip: just a caption. */
export const FloorStatusBadge = ({
  status,
  sobrePleno,
}: {
  status: FloorOpStatus;
  sobrePleno?: boolean;
}) => {
  const { t } = useApp();
  const style = FLOOR_STYLE[status];
  const label = t(`mesas.estadoOp.${status}`);
  if (sobrePleno) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold leading-tight">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current opacity-80" />
        <span className="truncate">{label}</span>
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.chip} ${style.text}`}>
      <span aria-hidden className={`size-2 rounded-full ${style.dot}`} />
      {label}
    </span>
  );
};
