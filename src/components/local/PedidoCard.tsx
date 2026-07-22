"use client";

import { useEffect, useState } from "react";
import type { EstadoPedido, PedidoVista } from "@/lib/types";
import { pedidoCerrado } from "@/lib/types";
import { useApp } from "@/components/providers/Providers";
import { useConfigStore } from "@/lib/store/config-store";

const PILL: Record<EstadoPedido, string> = {
  creado: "bg-amber-100 text-amber-700",
  en_preparacion: "bg-amber-100 text-amber-700", // legacy; UI ya no lo usa
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
  pedido: PedidoVista;
  index?: number;
  onCambiarEstado: (id: string, estado: EstadoPedido) => void;
  onMostrarQr?: (pedido: PedidoVista) => void;
}

// Flujo simple (mostrador / caja):
//   en curso → listo (avisar) → retirado
//   en curso / listo → cancelado (cliente cancela o no retira)
export const PedidoCard = ({
  pedido,
  index = 0,
  onCambiarEstado,
  onMostrarQr,
}: Props) => {
  const { t, locale } = useApp();
  const modo = useConfigStore((s) => s.modo);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (pedidoCerrado(pedido.estado)) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [pedido.estado]);

  const espera = minutosDesde(pedido.creadoEn, now);
  const enCurso =
    pedido.estado === "creado" || pedido.estado === "en_preparacion";
  const listo = pedido.estado === "listo";
  const cerrado = pedidoCerrado(pedido.estado);
  const urgente = espera !== null && espera >= 15 && !cerrado;

  const cancelar = () => {
        if (!window.confirm(t("card.confirmarCancel"))) return;
        onCambiarEstado(pedido.id, "cancelado");
      };

  return (
    <article
      className={`flex flex-col gap-4 rounded-[28px] border bg-surface p-5 shadow-sm transition duration-200 ${
        listo
          ? "border-emerald-300 ring-2 ring-emerald-300/60"
          : pedido.estado === "cancelado"
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
            {t(`modo.${modo}`)}
          </p>
          <p className="font-display text-3xl leading-none text-carbon">
            {pedido.referencia}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${PILL[pedido.estado]}`}
        >
          {listo && (
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          )}
          {enCurso
            ? t("estado.creado")
            : t(`estado.${pedido.estado}`)}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-carbon/40">{t("card.hora")}</dt>
          <dd className="mt-0.5 font-semibold text-carbon/75">
            {horaLocal(pedido.creadoEn, locale)}
          </dd>
        </div>
        {!cerrado && espera !== null && (
          <div>
            <dt className="text-carbon/40">{t("card.espera")}</dt>
            <dd
              className={`mt-0.5 font-semibold tabular-nums ${
                urgente ? "text-amber-700" : "text-carbon/75"
              }`}
            >
              {t("card.hace", { n: espera })}
            </dd>
          </div>
        )}
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-carbon/40">{t("card.empleado")}</dt>
          <dd className="mt-0.5 flex items-center gap-1.5 font-semibold text-carbon/75">
            {pedido.empleado ? (
              <>
                <span className="flex size-5 items-center justify-center rounded-full bg-marca/15 text-[10px] font-bold text-marca">
                  {pedido.empleado.trim()[0]?.toUpperCase()}
                </span>
                <span className="truncate">{pedido.empleado}</span>
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
          onClick={() => onCambiarEstado(pedido.id, "listo")}
          className="w-full rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.97]"
        >
          {t("card.marcarListo")}
        </button>
      )}
      {listo && (
        <button
          type="button"
          onClick={() => onCambiarEstado(pedido.id, "retirado")}
          className="w-full rounded-full border border-linea px-4 py-3 text-sm font-semibold text-carbon transition hover:bg-carbon/5 active:scale-[0.97]"
        >
          {t("card.marcarRetirado")}
        </button>
      )}

      {(enCurso || listo) && (
        <button
          type="button"
          onClick={cancelar}
          className="w-full rounded-full px-4 py-2 text-xs font-semibold text-red-600/80 transition hover:bg-red-50 hover:text-red-700"
        >
          {t("card.marcarCancelado")}
        </button>
      )}

      {onMostrarQr && !cerrado && (
        <button
          type="button"
          onClick={() => onMostrarQr(pedido)}
          className="flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-carbon/55 transition hover:bg-carbon/5"
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
