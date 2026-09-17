"use client";

import { useApp } from "@/components/providers/Providers";
import { FloorStatusBadge, FLOOR_STYLE } from "@/components/panel/mesas/FloorStatusBadge";
import { formatMoney } from "@/lib/tableBill";
import { firstName } from "@/lib/floorShift";
import { summarizeKitchen, type FloorTable } from "@/lib/tableOps";

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
  const style = FLOOR_STYLE[row.status];
  const kitchen = summarizeKitchen([...row.newOrders, ...row.prepOrders, ...row.readyOrders]);
  const kitchenHint = kitchen
    .slice(0, 2)
    .map((l) => `${l.quantity}× ${l.name}`)
    .join(" · ");
  const waiter =
    firstName(row.waiterName) || (row.bill ? t("recepcion.sinAsignar") : "");

  if (dense) {
    return (
      <li className="flex items-stretch gap-2">
        <button
          type="button"
          aria-current={active ? "true" : undefined}
          onClick={onOpen}
          className={`flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-linea border-l-[3px] bg-surface px-3 py-2 text-left transition hover:border-marca/30 active:scale-[0.99] ${style.bar} ${
            active ? "ring-2 ring-marca/25" : ""
          }`}
        >
          <span className="w-10 shrink-0 font-display text-2xl leading-none text-carbon">
            {row.tableNumber}
          </span>
          <span className="min-w-0 flex-1">
            <FloorStatusBadge status={row.status} />
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
          <span className="shrink-0 text-right">
            {row.bill && row.consumption > 0 ? (
              <span
                className={`block font-display text-lg tabular-nums leading-none ${
                  row.pending > 0 ? "text-alerta" : "text-ok"
                }`}
              >
                {formatMoney(row.pending > 0 ? row.pending : row.paid)}
              </span>
            ) : row.qrActive && !onShowQr ? (
              <span className="text-xs font-semibold text-marca">{t("mesas.verQrMesa")}</span>
            ) : null}
          </span>
        </button>
        {onShowQr ? (
          <button
            type="button"
            onClick={onShowQr}
            className="min-h-14 shrink-0 rounded-2xl border border-linea bg-surface px-3 text-xs font-semibold text-marca"
          >
            {t("mesas.verQrMesa")}
          </button>
        ) : null}
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-1">
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        onClick={onOpen}
        className={`flex min-h-[6.5rem] w-full flex-1 flex-col justify-between rounded-2xl border border-linea border-l-[3px] bg-surface px-3 py-2.5 text-left transition hover:border-marca/30 active:scale-[0.99] ${style.bar} ${
            active ? "ring-2 ring-marca/25" : ""
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
        <FloorStatusBadge status={row.status} />
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
            {row.qrActive && !onShowQr ? t("mesas.verQrMesa") : "—"}
          </span>
        )}
      </button>
      {onShowQr ? (
        <button
          type="button"
          onClick={onShowQr}
          className="min-h-9 w-full rounded-xl border border-linea bg-surface text-xs font-semibold text-marca"
        >
          {t("mesas.verQrMesa")}
        </button>
      ) : null}
    </li>
  );
};
