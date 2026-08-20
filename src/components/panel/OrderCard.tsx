"use client";

import { useEffect, useState } from "react";
import type { OrderStatus, OrderView } from "@/lib/types";
import { orderClosed } from "@/lib/types";
import { useApp } from "@/components/providers/Providers";
import { useConfigStore } from "@/lib/store/config-store";

const PILL: Record<OrderStatus, string> = {
  creado: "bg-amber-100 text-amber-700",
  en_preparacion: "bg-amber-100 text-amber-700",
  listo: "bg-emerald-100 text-emerald-700",
  retirado: "bg-carbon/5 text-carbon/40",
  cancelado: "bg-red-100 text-red-700",
};

const minutosDesde = (iso: string | null, now: number): number | null => {
  if (!iso) return null;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
};

const horaLocal = (iso: string, locale: string): string => {
  return new Date(iso).toLocaleTimeString(locale === "en" ? "en-US" : "es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

interface Props {
  pedido: OrderView;
  index?: number;
  onCambiarEstado: (id: string, status: OrderStatus) => void | Promise<void>;
  onMostrarQr?: (order: OrderView) => void;
  onReavisar?: (id: string) => void;
}

export const OrderCard = ({
  pedido: order,
  index = 0,
  onCambiarEstado,
  onMostrarQr,
  onReavisar,
}: Props) => {
  const { t, locale } = useApp();
  const mode = useConfigStore((s) => s.modo);
  const [now, setNow] = useState(() => Date.now());
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (orderClosed(order.status)) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [order.status]);

  const wait = minutosDesde(order.createdAt, now);
  const enCurso =
    order.status === "creado" || order.status === "en_preparacion";
  const listo = order.status === "listo";
  const cerrado = orderClosed(order.status);
  const urgente = wait !== null && wait >= 15 && !cerrado;

  const cambiar = (status: OrderStatus) => {
    if (busy) return;
    setBusy(true);
    void Promise.resolve(onCambiarEstado(order.id, status)).finally(() => {
      setBusy(false);
    });
  };

  return (
    <article
      className={`flex flex-col gap-4 rounded-[28px] border bg-surface p-5 shadow-sm transition duration-200 ${
        listo
          ? "border-emerald-300 ring-2 ring-emerald-300/60"
          : order.status === "cancelado"
            ? "border-linea opacity-70"
            : urgente
              ? "border-amber-300/80"
              : "border-linea"
      }`}
      style={{ animationDelay: `${0.05 + index * 0.04}s` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-carbon/40">
            {t(`modo.${mode}`)}
          </p>
          <p className="font-display text-3xl leading-none text-carbon">
            {order.reference}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${PILL[order.status]}`}
        >
          {listo && (
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          )}
          {enCurso
            ? t("estado.creado")
            : t(`estado.${order.status}`)}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-carbon/40">{t("card.hora")}</dt>
          <dd className="mt-0.5 font-semibold text-carbon/75">
            {horaLocal(order.createdAt, locale)}
          </dd>
        </div>
        {!cerrado && wait !== null && (
          <div>
            <dt className="text-carbon/40">{t("card.espera")}</dt>
            <dd
              className={`mt-0.5 font-semibold tabular-nums ${
                urgente ? "text-amber-700" : "text-carbon/75"
              }`}
            >
              {t("card.hace", { n: wait })}
            </dd>
          </div>
        )}
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-carbon/40">{t("card.empleado")}</dt>
          <dd className="mt-0.5 flex items-center gap-1.5 font-semibold text-carbon/75">
            {order.employee ? (
              <>
                <span className="flex size-5 items-center justify-center rounded-full bg-marca/15 text-[10px] font-bold text-marca">
                  {order.employee.trim()[0]?.toUpperCase()}
                </span>
                <span className="truncate">{order.employee}</span>
              </>
            ) : (
              <span className="font-normal text-carbon/40">
                {t("card.sinEmp")}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {enCurso && (
        <button
          type="button"
          disabled={busy}
          onClick={() => cambiar("listo")}
          className="w-full rounded-full bg-emerald-600 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.97] disabled:opacity-50 sm:py-3"
        >
          {busy ? "…" : t("card.marcarListo")}
        </button>
      )}
      {listo && onReavisar && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onReavisar(order.id)}
          className="w-full rounded-full border border-marca/40 bg-marca/5 px-4 py-2.5 text-sm font-semibold text-marca transition hover:bg-marca/10 active:scale-[0.97] disabled:opacity-50"
        >
          {locale === "en" ? "Notify again 🔔" : "Volver a avisar 🔔"}
        </button>
      )}
      {listo && (
        <button
          type="button"
          disabled={busy}
          onClick={() => cambiar("retirado")}
          className="w-full rounded-full border border-linea px-4 py-3.5 text-sm font-semibold text-carbon transition hover:bg-carbon/5 active:scale-[0.97] disabled:opacity-50 sm:py-3"
        >
          {busy ? "…" : t("card.marcarRetirado")}
        </button>
      )}

      {(enCurso || listo) &&
        (confirmCancel ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-red-200 bg-red-50 p-2">
            <p className="px-1 text-center text-xs font-medium text-red-800">
              {t("card.confirmarCancel")}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  cambiar("cancelado");
                  setConfirmCancel(false);
                }}
                className="flex-1 rounded-full bg-red-500 text-white transition hover:bg-red-600 active:scale-[0.97] flex min-h-11 items-center justify-center px-4 text-sm font-semibold disabled:opacity-50 sm:min-h-0 sm:py-2 sm:text-xs"
              >
                {locale === "en" ? "Yes, cancel" : "Sí, cancelar"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                className="flex-1 rounded-full border border-linea bg-surface text-carbon/60 transition hover:bg-carbon/5 flex min-h-11 items-center justify-center px-4 text-sm font-semibold sm:min-h-0 sm:py-2 sm:text-xs"
              >
                {locale === "en" ? "Keep it" : "No, dejarlo"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            className="w-full rounded-full text-red-600/80 transition hover:bg-red-50 hover:text-red-700 flex min-h-11 items-center justify-center px-4 text-sm font-semibold sm:min-h-0 sm:py-2 sm:text-xs"
          >
            {t("card.marcarCancelado")}
          </button>
        ))}

      {onMostrarQr && !cerrado && (
        <button
          type="button"
          onClick={() => onMostrarQr(order)}
          className="w-full gap-1.5 rounded-full text-carbon/55 transition hover:bg-carbon/5 flex min-h-11 items-center justify-center px-4 text-sm font-semibold sm:min-h-0 sm:py-2 sm:text-xs"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 14h3v3M20 20v.01M14 20v.01M20 14v.01" />
          </svg>
          {t("qr.verQr")}
        </button>
      )}
    </article>
  );
};
