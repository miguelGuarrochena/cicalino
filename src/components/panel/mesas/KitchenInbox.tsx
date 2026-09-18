"use client";

import type { ReactNode } from "react";
import { Fragment, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useToast } from "@/components/ui/Toast";
import { summarizeKitchen, type FloorTable } from "@/lib/tableOps";
import type { BillOrder } from "@/lib/tableBill";

export const KitchenInbox = ({
  created,
  called,
  busy,
  newOrderIds,
  newCallIds,
  onOpen,
  onPassToKitchen,
  onCancel,
  onAcknowledge,
}: {
  created: FloorTable[];
  called: FloorTable[];
  busy: string | null;
  newOrderIds?: ReadonlySet<string>;
  newCallIds?: ReadonlySet<string>;
  onOpen: (row: FloorTable) => void;
  onPassToKitchen: (row: FloorTable) => void;
  onCancel: (row: FloorTable, orders: BillOrder[]) => void;
  onAcknowledge: (row: FloorTable) => void;
}) => {
  const { t } = useApp();
  if (!created.length && !called.length) return null;

  return (
    <div className="flex flex-col gap-3 print:hidden">
      {created.length > 0 && (
        <p className="text-sm text-carbon/60">{t("mesas.inboxAyuda")}</p>
      )}
      {created.length > 0 && (
        <InboxBlock
          title={t("mesas.nuevosPedidos")}
          rows={created}
          /* "Visto" es por dispositivo y eso hay que decirlo donde se lee: en
           * un `title` el mozo del teléfono no lo ve nunca, y dos tablets
           * pueden creer cada una que la otra ya se ocupó. */
          nota={
            created.some((r) => r.newOrders.some((o) => !(newOrderIds?.has(o.id) ?? true)))
              ? t("mesas.vistoDispositivo")
              : undefined
          }
        >
          {(row) => (
            <InboxRow
              row={row}
              orders={row.newOrders}
              newOrderIds={newOrderIds}
              nuevo={row.newOrders.some((o) => newOrderIds?.has(o.id) ?? true)}
              actionLabel={t("mesas.pasarAComanda")}
              busy={busy}
              onOpen={onOpen}
              onAction={onPassToKitchen}
              onCancel={onCancel}
              onAcknowledge={row.calledAt ? onAcknowledge : undefined}
            />
          )}
        </InboxBlock>
      )}
      {called.length > 0 && (
        <InboxBlock title={t("mesas.teLlaman")} rows={called} tone="alerta">
          {(row) => (
            <li
              className={`rounded-2xl bg-surface p-4 ${
                row.bill && (newCallIds?.has(row.bill.session.id) ?? true)
                  ? "u-alert-beat u-alert-halo"
                  : ""
              }`}
            >
              <button type="button" onClick={() => onOpen(row)} className="w-full text-left">
                <span className="font-display text-2xl uppercase leading-none text-carbon">
                  {t("mesa.mesaN", { n: row.tableNumber })}
                </span>
                <p className="mt-2 text-sm text-carbon/70">{t("mesas.llamadoAyuda")}</p>
              </button>
              <button
                type="button"
                disabled={busy === row.key}
                onClick={() => onAcknowledge(row)}
                className="mt-4 flex min-h-12 w-full items-center justify-center rounded-full bg-marca px-5 text-base font-semibold text-crema disabled:opacity-50"
              >
                {t("mesas.yaVoy")}
              </button>
            </li>
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
  nota,
  tone = "marca",
}: {
  title: string;
  rows: FloorTable[];
  children: (row: FloorTable) => ReactNode;
  nota?: string;
  tone?: "marca" | "alerta";
}) => (
  <section
    className={`rounded-2xl border p-3 sm:p-4 ${
      tone === "alerta"
        ? "border-alerta/30 bg-alerta/5"
        : "border-marca/25 bg-marca/5"
    }`}
  >
    <h2
      className={`text-xs font-semibold uppercase tracking-wide ${
        tone === "alerta" ? "text-alerta" : "text-marca"
      }`}
    >
      {title}
      <span
        className={`ml-1.5 tabular-nums ${
          tone === "alerta" ? "text-alerta/70" : "text-marca/70"
        }`}
      >
        {rows.length}
      </span>
    </h2>
    {nota ? <p className="mt-1.5 text-xs text-carbon/55">{nota}</p> : null}
    <ul className="mt-3 flex flex-col gap-3">
      {rows.map((row) => (
        <Fragment key={row.key}>{children(row)}</Fragment>
      ))}
    </ul>
  </section>
);

const InboxRow = ({
  row,
  orders,
  newOrderIds,
  nuevo,
  actionLabel,
  busy,
  onOpen,
  onAction,
  onCancel,
  onAcknowledge,
}: {
  row: FloorTable;
  orders: BillOrder[];
  newOrderIds?: ReadonlySet<string>;
  /* Late mientras nadie lo haya mirado. Después sigue en la cola, quieto. */
  nuevo?: boolean;
  actionLabel: string;
  busy: string | null;
  onOpen: (row: FloorTable) => void;
  onAction: (row: FloorTable) => void;
  onCancel: (row: FloorTable, orders: BillOrder[]) => void;
  onAcknowledge?: (row: FloorTable) => void;
}) => {
  const { t } = useApp();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const lines = summarizeKitchen(orders);
  const locked = busy === row.key;
  const timed = [...orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

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
    <li
      className={`rounded-2xl bg-surface p-4 ${
        nuevo ? "u-alert-beat u-alert-halo u-alert-halo-marca" : ""
      }`}
    >
      <button type="button" onClick={() => onOpen(row)} className="w-full text-left">
        <span className="font-display text-2xl uppercase leading-none text-carbon">
          {t("mesa.mesaN", { n: row.tableNumber })}
        </span>
        {row.calledAt ? (
          <p className="mt-1 text-sm font-semibold text-alerta">{t("mesas.teLlaman")}</p>
        ) : null}
        {row.billRequests.length > 0 ? (
          <p className="mt-1 text-sm font-semibold text-curso">{t("mesas.solicitaCuenta")}</p>
        ) : null}
        <ul className="mt-3 flex flex-col gap-3">
          {timed.map((o) => {
            const isNew = newOrderIds?.has(o.id) ?? o.status === "creado";
            return (
              <li key={o.id}>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-carbon/55">
                  <span>
                    {new Date(o.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span
                    className={
                      isNew
                        ? "font-semibold text-marca"
                        : "font-normal text-carbon/45"
                    }
                  >
                    {isNew ? t("mesas.nuevo") : t("mesas.visto")}
                  </span>
                </p>
                <ul className="mt-1 flex flex-col gap-0.5 text-base text-carbon/80">
                  {o.items.map((item) => (
                    <li key={item.id}>
                      {item.quantity} × {item.name}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </button>
      <button
        type="button"
        disabled={locked}
        onClick={() => onAction(row)}
        className="mt-4 flex min-h-12 w-full items-center justify-center rounded-full bg-marca px-5 text-base font-semibold text-crema disabled:opacity-50"
      >
        {actionLabel}
      </button>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {onAcknowledge && (
            <button
              type="button"
              disabled={locked}
              onClick={() => onAcknowledge(row)}
              className="min-h-11 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/70"
            >
              {t("mesas.yaVoy")}
            </button>
          )}
          <button
            type="button"
            disabled={locked}
            onClick={() => onOpen(row)}
            className="min-h-11 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/70"
          >
            {t("mesas.verPedido")}
          </button>
          <button
            type="button"
            onClick={() => void copyTicket()}
            className="min-h-11 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/70"
          >
            {copied ? t("mesa.copiado") : t("mesas.copiarTicket")}
          </button>
        </div>
        <button
          type="button"
          disabled={locked}
          onClick={() => onCancel(row, orders)}
          className="min-h-11 rounded-full border border-transparent px-4 text-sm font-semibold text-red-600 hover:border-red-300 hover:bg-red-500/10 disabled:opacity-50"
        >
          {t("mesas.cancelarPedido")}
        </button>
      </div>
    </li>
  );
};
