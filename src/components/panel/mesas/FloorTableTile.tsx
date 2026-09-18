"use client";

import { useApp } from "@/components/providers/Providers";
import { FloorStatusBadge } from "@/components/panel/mesas/FloorStatusBadge";
import { formatMoney } from "@/lib/tableBill";
import { firstName } from "@/lib/floorShift";
import { summarizeKitchen, type FloorTable } from "@/lib/tableOps";

const hasOrder = (row: FloorTable) =>
  row.newOrders.length + row.prepOrders.length + row.readyOrders.length > 0 ||
  row.consumption > 0;

/* Solid fill per state, like the floor map in Recepción: the tile is the
 * colour and everything inside it reads in crema. Washed-out tints and the
 * thick left bar didn't survive a glance across the room. */
const tileTone = (row: FloorTable) => {
  if (row.calledAt || row.status === "llamado") {
    return "border-alerta bg-alerta text-crema";
  }
  if (row.status === "pedido-nuevo") {
    return "border-marca bg-marca text-crema";
  }
  if (row.status === "pagada") {
    return "border-ok bg-ok text-crema";
  }
  if (row.pending > 0) {
    return "border-alerta bg-alerta text-crema";
  }
  if (hasOrder(row)) {
    return "border-curso bg-curso text-crema";
  }
  if (row.bill) {
    return "border-carbon bg-carbon text-crema";
  }
  return "border-espera bg-espera text-crema";
};

/* La mesa con algo que todavía nadie miró late y tira un halo.
 *
 * El color del tile ya dice en qué estado está, pero el estado no cambia
 * cuando el evento es nuevo: una mesa consumiendo y una mesa que acaba de
 * llamar se pintaban casi igual. El movimiento es lo único que se nota
 * mirando de reojo desde tres metros. Se apaga al abrir la mesa — "visto" no
 * es "resuelto", pero ya no hace falta gritar. */
export type TileAlert = "llamado" | "pedido" | "cuenta" | null;

const ALERT_CLASS: Record<"llamado" | "pedido" | "cuenta", string> = {
  llamado: "u-alert-beat u-alert-halo",
  pedido: "u-alert-beat u-alert-halo u-alert-halo-marca",
  cuenta: "u-alert-beat u-alert-halo u-alert-halo-curso",
};

const tileClass = (tone: string, active: boolean, alerta: TileAlert) =>
  `flex overflow-hidden rounded-2xl border-2 ${tone} ${active ? "ring-2 ring-carbon/25" : ""} ${
    alerta ? ALERT_CLASS[alerta] : ""
  }`;

export const FloorTableTile = ({
  row,
  active,
  dense,
  alerta = null,
  onOpen,
}: {
  row: FloorTable;
  active: boolean;
  dense?: boolean;
  alerta?: TileAlert;
  onOpen: () => void;
}) => {
  const { t } = useApp();
  const tone = tileTone(row);
  const kitchen = summarizeKitchen([...row.newOrders, ...row.prepOrders, ...row.readyOrders]);
  const kitchenHint = kitchen
    .slice(0, 2)
    .map((l) => `${l.quantity}× ${l.name}`)
    .join(" · ");
  const waiter =
    firstName(row.waiterName) || (row.bill ? t("recepcion.sinAsignar") : "");
  const amount =
    row.bill && row.consumption > 0
      ? formatMoney(row.pending > 0 ? row.pending : row.paid)
      : null;
  /* "Pendiente de pago" + $ is the same story twice. Kitchen states still
   * need their label: a new order is the action, the amount is just context. */
  const showStatus = row.status !== "pendiente" || !amount;
  const meta =
    [
      waiter,
      kitchenHint || (row.people > 0 ? t("mesas.personasN", { n: row.people }) : null),
    ]
      .filter(Boolean)
      .join(" · ") || (showStatus ? null : t("mesas.estadoOp.libre"));

  if (dense) {
    return (
      <li className={`items-stretch ${tileClass(tone, active, alerta)}`}>
        <button
          type="button"
          aria-current={active ? "true" : undefined}
          onClick={onOpen}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left transition hover:brightness-95 active:scale-[0.99]"
        >
          <span className="w-10 shrink-0 font-display text-2xl leading-none">
            {row.tableNumber}
          </span>
          <span className="min-w-0 flex-1">
            {showStatus ? <FloorStatusBadge status={row.status} sobrePleno /> : null}
            {meta ? (
              <span className={`block truncate text-[11px] opacity-75 ${showStatus ? "mt-0.5" : ""}`}>
                {meta}
              </span>
            ) : null}
          </span>
          {amount ? (
            <span className="shrink-0 font-display text-lg tabular-nums leading-none">{amount}</span>
          ) : null}
        </button>
      </li>
    );
  }

  return (
    <li className={`min-h-[6.5rem] flex-col ${tileClass(tone, active, alerta)}`}>
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        onClick={onOpen}
        className="flex w-full flex-1 flex-col text-left transition hover:brightness-95 active:scale-[0.99]"
      >
        <span className="flex min-h-0 flex-1 flex-col gap-1 px-3 pt-2.5 pb-2">
          <span className="flex items-start justify-between gap-1">
            <span className="font-display text-2xl leading-none">{row.tableNumber}</span>
            {row.people > 0 && (
              <span className="text-[10px] font-semibold tabular-nums opacity-70">
                {t("mesas.personasN", { n: row.people })}
              </span>
            )}
          </span>
          {waiter ? (
            <span className="truncate text-[10px] font-semibold leading-none opacity-80">
              {waiter}
            </span>
          ) : null}
          {showStatus ? (
            <FloorStatusBadge status={row.status} sobrePleno />
          ) : kitchenHint ? (
            <span className="truncate text-[10px] opacity-75">{kitchenHint}</span>
          ) : null}
        </span>
        {amount ? (
          <span className="mt-auto border-t border-white/20 bg-black/15 px-3 py-1.5 font-display text-[15px] tabular-nums leading-none">
            {amount}
          </span>
        ) : null}
      </button>
    </li>
  );
};
