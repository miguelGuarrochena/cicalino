"use client";

import { useApp } from "@/components/providers/Providers";
import type { FloorOpStatus } from "@/lib/tableOps";

/* El color responde una sola pregunta: ¿tengo que hacer algo ahora?
 *
 * Antes no la respondía. "Pendiente de pago" —una mesa comiendo con la cuenta
 * abierta, o sea casi todas— iba en rojo, el mismo rojo que "te llaman". Con
 * media sala en rojo, el rojo dejaba de querer decir algo.
 *
 * Ahora hay tres colores de acción y el resto es fondo:
 *
 *   rojo (alerta) → te llaman, andá
 *   azul (marca)  → comanda nueva para anotar
 *   ámbar (curso) → hay plata esperando que la confirmes
 *   verde (ok)    → cobrada, no debe nada
 *   carbón        → ocupada y tranquila
 *   teal (espera) → libre
 */
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
  /* Comiendo con la cuenta abierta: no hay nada que hacer todavía. */
  pendiente: {
    bar: "border-l-carbon/40",
    dot: "bg-carbon/45",
    text: "text-carbon/70",
    chip: "bg-carbon/10",
  },
  /* Ya cobró una parte. Tampoco pide nada ahora, pero no es lo mismo que
   * "no pagó nada": lleva el punto del dinero para distinguirse de un vistazo. */
  parcial: {
    bar: "border-l-ok",
    dot: "bg-ok",
    text: "text-carbon/70",
    chip: "bg-ok-fondo",
  },
  preparando: {
    bar: "border-l-carbon/40",
    dot: "bg-carbon/45",
    text: "text-carbon/70",
    chip: "bg-carbon/10",
  },
  consumiendo: {
    bar: "border-l-carbon/40",
    dot: "bg-carbon/45",
    text: "text-carbon/70",
    chip: "bg-carbon/10",
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
