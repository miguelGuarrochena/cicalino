"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useToast } from "@/components/ui/Toast";
import { summarizeKitchen, type FloorTable } from "@/lib/tableOps";
import type { BillOrder } from "@/lib/tableBill";

export const KitchenInbox = ({
  created,
  prep,
  ready,
  busy,
  onOpen,
  onPassToKitchen,
  onReady,
  onServe,
  onCancel,
}: {
  created: FloorTable[];
  prep: FloorTable[];
  ready: FloorTable[];
  busy: string | null;
  onOpen: (row: FloorTable) => void;
  onPassToKitchen: (row: FloorTable) => void;
  onReady: (row: FloorTable) => void;
  onServe: (row: FloorTable) => void;
  onCancel: (row: FloorTable, orders: BillOrder[]) => void;
}) => {
  const { t } = useApp();
  if (!created.length && !prep.length && !ready.length) return null;

  return (
    <div className="flex flex-col gap-3 print:hidden">
      {created.length > 0 && (
        <p className="text-sm text-carbon/60">{t("mesas.inboxAyuda")}</p>
      )}
      {created.length > 0 && (
        <InboxBlock title={t("mesas.nuevosPedidos")} rows={created}>
          {(row) => (
            <InboxRow
              row={row}
              orders={row.newOrders}
              actionLabel={t("mesas.pasarAComanda")}
              busy={busy}
              onOpen={onOpen}
              onAction={onPassToKitchen}
              onCancel={onCancel}
            />
          )}
        </InboxBlock>
      )}
      {prep.length > 0 && (
        <InboxBlock title={t("mesas.enComanda")} rows={prep}>
          {(row) => (
            <InboxRow
              row={row}
              orders={row.prepOrders}
              actionLabel={t("mesas.marcarListo")}
              busy={busy}
              onOpen={onOpen}
              onAction={onReady}
              onCancel={onCancel}
            />
          )}
        </InboxBlock>
      )}
      {ready.length > 0 && (
        <InboxBlock title={t("mesas.listosParaEntregar")} rows={ready}>
          {(row) => (
            <InboxRow
              row={row}
              orders={row.readyOrders}
              actionLabel={t("mesas.marcarEntregado")}
              busy={busy}
              onOpen={onOpen}
              onAction={onServe}
              onCancel={onCancel}
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
  <section className="rounded-2xl border border-marca/25 bg-marca/5 p-3 sm:p-4">
    <h2 className="text-xs font-semibold uppercase tracking-wide text-marca">
      {title}
      <span className="ml-1.5 tabular-nums text-marca/70">{rows.length}</span>
    </h2>
    <ul className="mt-3 flex flex-col gap-3">{rows.map((row) => children(row))}</ul>
  </section>
);

const InboxRow = ({
  row,
  orders,
  actionLabel,
  busy,
  onOpen,
  onAction,
  onCancel,
}: {
  row: FloorTable;
  orders: BillOrder[];
  actionLabel: string;
  busy: string | null;
  onOpen: (row: FloorTable) => void;
  onAction: (row: FloorTable) => void;
  onCancel: (row: FloorTable, orders: BillOrder[]) => void;
}) => {
  const { t } = useApp();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const lines = summarizeKitchen(orders);
  const locked = busy === row.key;

  const copyTicket = async () => {
    const text = [
      t("mesa.mesaN", { n: row.tableNumber }),
      ...lines.map((l) => `${l.quantity} × ${l.name}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast(t("mesas.ticketCopiado"), "success");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Sin clipboard: el pedido sigue en pantalla para copiarlo a mano. */
    }
  };

  return (
    <li className="rounded-2xl bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" onClick={() => onOpen(row)} className="min-w-0 flex-1 text-left">
          <span className="font-display text-2xl uppercase leading-none text-carbon">
            {t("mesa.mesaN", { n: row.tableNumber })}
          </span>
          <ul className="mt-2 flex flex-col gap-0.5 text-sm text-carbon/80">
            {lines.map((l) => (
              <li key={l.name}>
                {l.quantity} × {l.name}
              </li>
            ))}
          </ul>
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={() => onAction(row)}
          className="min-h-11 shrink-0 rounded-full bg-marca px-5 text-sm font-semibold text-crema disabled:opacity-50"
        >
          {actionLabel}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copyTicket()}
          className="min-h-10 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/70"
        >
          {copied ? t("mesa.copiado") : t("mesas.copiarTicket")}
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={() => onCancel(row, orders)}
          className="min-h-10 rounded-full border border-transparent px-4 text-sm font-semibold text-red-600 hover:border-red-300 hover:bg-red-500/10 disabled:opacity-50"
        >
          {t("mesas.cancelarPedido")}
        </button>
      </div>
    </li>
  );
};
