"use client";

import { useApp } from "@/components/providers/Providers";
import { FloorStatusBadge } from "@/components/panel/mesas/FloorStatusBadge";
import { formatMoney } from "@/lib/tableBill";
import { firstName } from "@/lib/floorShift";
import { summarizeKitchen, type FloorTable } from "@/lib/tableOps";

const hasOrder = (row: FloorTable) =>
  row.newOrders.length + row.prepOrders.length + row.readyOrders.length > 0 ||
  row.consumption > 0;

const moneyStatus = (status: FloorTable["status"]) =>
  status === "pendiente" ||
  status === "parcial" ||
  status === "esperando-pago" ||
  status === "pagada";

const tileTone = (row: FloorTable) => {
  if (row.pending > 0) {
    return "border-alerta/40 bg-alerta/[0.09] border-l-alerta";
  }
  if (hasOrder(row)) {
    return "border-marca/35 bg-marca/[0.08] border-l-marca";
  }
  if (row.bill) {
    return "border-carbon/20 bg-carbon/[0.04] border-l-carbon/35";
  }
  return "border-linea bg-surface border-l-linea";
};

export const FloorTableTile = ({
  row,
  active,
  dense,
  onOpen,
  onShowQr,
}: {
  row: FloorTable;
  active: boolean;
  dense?: boolean;
  onOpen: () => void;
  onShowQr?: () => void;
}) => {
  const { t } = useApp();
  const tone = tileTone(row);
  const ordered = hasOrder(row);
  const kitchen = summarizeKitchen([...row.newOrders, ...row.prepOrders, ...row.readyOrders]);
  const kitchenHint = kitchen
    .slice(0, 2)
    .map((l) => `${l.quantity}× ${l.name}`)
    .join(" · ");
  const waiter =
    firstName(row.waiterName) || (row.bill ? t("recepcion.sinAsignar") : "");
  const showQr = Boolean(ordered && onShowQr);
  const chargingHint =
    row.pending > 0 && !moneyStatus(row.status) ? t("mesas.porCobrar") : null;

  if (dense) {
    return (
      <li
        className={`flex items-stretch overflow-hidden rounded-2xl border border-l-[3px] ${tone} ${
          active ? "ring-2 ring-marca/25" : ""
        }`}
      >
        <button
          type="button"
          aria-current={active ? "true" : undefined}
          onClick={onOpen}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left transition hover:bg-carbon/[0.03] active:scale-[0.99]"
        >
          <span className="w-10 shrink-0 font-display text-2xl leading-none text-carbon">
            {row.tableNumber}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2">
              <FloorStatusBadge status={row.status} />
              {chargingHint ? (
                <span className="text-[11px] font-semibold text-alerta">{chargingHint}</span>
              ) : null}
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-carbon/50">
              {[
                waiter,
                kitchenHint ||
                  (row.people > 0 ? t("mesas.personasN", { n: row.people }) : null),
              ]
                .filter(Boolean)
                .join(" · ") || t("mesas.estadoOp.libre")}
            </span>
          </span>
          {row.bill && row.consumption > 0 ? (
            <span
              className={`shrink-0 font-display text-lg tabular-nums leading-none ${
                row.pending > 0 ? "text-alerta" : "text-ok"
              }`}
            >
              {formatMoney(row.pending > 0 ? row.pending : row.paid)}
            </span>
          ) : null}
        </button>
        {showQr ? (
          <button
            type="button"
            onClick={onShowQr}
            className="shrink-0 self-center px-3 py-2 text-xs font-semibold text-marca"
          >
            {t("mesas.verQrMesa")}
          </button>
        ) : null}
      </li>
    );
  }

  return (
    <li
      className={`relative flex min-h-[6.5rem] flex-col overflow-hidden rounded-2xl border border-l-[3px] ${tone} ${
        active ? "ring-2 ring-marca/25" : ""
      }`}
    >
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        onClick={onOpen}
        className={`flex w-full flex-1 flex-col justify-between px-3 py-2.5 text-left transition hover:bg-carbon/[0.03] active:scale-[0.99] ${
          showQr ? "pb-8" : ""
        }`}
      >
        <span className="flex items-start justify-between gap-1">
          <span className="font-display text-2xl leading-none text-carbon">{row.tableNumber}</span>
          {row.people > 0 && (
            <span className="text-[10px] font-semibold tabular-nums text-carbon/45">
              {t("mesas.personasN", { n: row.people })}
            </span>
          )}
        </span>
        {waiter ? (
          <span className="truncate text-[10px] font-semibold leading-none text-carbon/55">
            {waiter}
          </span>
        ) : null}
        <span className="flex flex-wrap items-center gap-x-1.5">
          <FloorStatusBadge status={row.status} />
          {chargingHint ? (
            <span className="text-[10px] font-semibold text-alerta">{chargingHint}</span>
          ) : null}
        </span>
        {row.bill && row.consumption > 0 ? (
          <span
            className={`font-display text-sm tabular-nums leading-none ${
              row.pending > 0 ? "text-alerta" : "text-ok"
            }`}
          >
            {formatMoney(row.pending > 0 ? row.pending : row.paid)}
          </span>
        ) : kitchenHint ? (
          <span className="truncate text-[10px] text-carbon/50">{kitchenHint}</span>
        ) : (
          <span className="text-[10px] text-carbon/40">
            {row.bill ? t("mesas.estadoOp.sin-consumo") : t("mesas.estadoOp.libre")}
          </span>
        )}
      </button>
      {showQr ? (
        <button
          type="button"
          onClick={onShowQr}
          className="absolute bottom-2 left-3 text-[11px] font-semibold text-marca"
        >
          {t("mesas.verQrMesa")}
        </button>
      ) : null}
    </li>
  );
};
