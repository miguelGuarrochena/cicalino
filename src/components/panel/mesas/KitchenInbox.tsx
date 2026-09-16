"use client";

import type { ReactNode } from "react";
import { useApp } from "@/components/providers/Providers";
import { summarizeKitchen, type FloorTable } from "@/lib/tableOps";

export const KitchenInbox = ({
  created,
  prep,
  ready,
  busy,
  onOpen,
  onPassToKitchen,
  onReady,
  onServe,
}: {
  created: FloorTable[];
  prep: FloorTable[];
  ready: FloorTable[];
  busy: string | null;
  onOpen: (row: FloorTable) => void;
  onPassToKitchen: (row: FloorTable) => void;
  onReady: (row: FloorTable) => void;
  onServe: (row: FloorTable) => void;
}) => {
  const { t } = useApp();
  if (!created.length && !prep.length && !ready.length) return null;

  return (
    <div className="flex flex-col gap-3 print:hidden">
      {created.length > 0 && (
        <InboxBlock title={t("mesas.nuevosPedidos")} rows={created}>
          {(row) => (
            <InboxRow
              row={row}
              actionLabel={t("mesas.pasarAComanda")}
              busy={busy}
              onOpen={onOpen}
              onAction={onPassToKitchen}
            />
          )}
        </InboxBlock>
      )}
      {prep.length > 0 && (
        <InboxBlock title={t("mesas.enComanda")} rows={prep}>
          {(row) => (
            <InboxRow
              row={row}
              actionLabel={t("mesas.marcarListo")}
              busy={busy}
              onOpen={onOpen}
              onAction={onReady}
            />
          )}
        </InboxBlock>
      )}
      {ready.length > 0 && (
        <InboxBlock title={t("mesas.listosParaEntregar")} rows={ready}>
          {(row) => (
            <InboxRow
              row={row}
              actionLabel={t("mesas.marcarEntregado")}
              busy={busy}
              onOpen={onOpen}
              onAction={onServe}
            />
          )}
        </InboxBlock>
      )}
    </div>
  );
};

const InboxBlock = ({
  title,
  rows,
  children,
}: {
  title: string;
  rows: FloorTable[];
  children: (row: FloorTable) => ReactNode;
}) => (
  <section className="rounded-2xl border border-marca/20 bg-marca/5 p-3">
    <h2 className="text-xs font-semibold uppercase tracking-wide text-marca">
      {title}
      <span className="ml-1.5 tabular-nums text-marca/70">{rows.length}</span>
    </h2>
    <ul className="mt-2 flex flex-col gap-2">{rows.map((row) => children(row))}</ul>
  </section>
);

const InboxRow = ({
  row,
  actionLabel,
  busy,
  onOpen,
  onAction,
}: {
  row: FloorTable;
  actionLabel: string;
  busy: string | null;
  onOpen: (row: FloorTable) => void;
  onAction: (row: FloorTable) => void;
}) => {
  const { t } = useApp();
  const orders =
    row.newOrders.length > 0 ? row.newOrders : row.readyOrders.length > 0 ? row.readyOrders : row.prepOrders;
  const lines = summarizeKitchen(orders);
  const locked = busy === row.key;
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-3 py-2">
      <button
        type="button"
        onClick={() => onOpen(row)}
        className="min-w-0 flex-1 text-left"
      >
        <span className="font-display text-lg uppercase leading-none text-carbon">
          {t("mesa.mesaN", { n: row.tableNumber })}
        </span>
        <span className="mt-1 block text-sm text-carbon/75">
          {lines.map((l) => `${l.quantity} × ${l.name}`).join(" · ")}
        </span>
      </button>
      <button
        type="button"
        disabled={locked}
        onClick={() => onAction(row)}
        className="min-h-10 shrink-0 rounded-full bg-marca px-4 text-xs font-semibold text-crema disabled:opacity-50"
      >
        {actionLabel}
      </button>
    </li>
  );
};
