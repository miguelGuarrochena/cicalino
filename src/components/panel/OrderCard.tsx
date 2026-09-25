"use client";

import { useEffect, useState } from "react";
import type { OrderStatus, OrderView } from "@/lib/types";
import { orderClosed } from "@/lib/types";
import { useApp } from "@/components/providers/Providers";
import { useConfirm } from "@/components/ui/Confirm";
import { useConfigStore } from "@/lib/store/config-store";
import { formatMoney } from "@/lib/tableBill";

const PILL: Record<OrderStatus, string> = {
  pendiente_pago: "bg-curso-fondo text-curso",
  creado: "bg-curso-fondo text-curso",
  en_preparacion: "bg-curso-fondo text-curso",
  listo: "bg-ok-fondo text-ok",
  retirado: "bg-carbon/5 text-carbon/40",
  cancelado: "bg-alerta-fondo text-alerta",
};

/* ¿Este pedido se avisa solo, o hay que cantarlo?
 *
 *  ok       escaneó el QR y dejó los avisos activos → le llega el push.
 *  pantalla escaneó, sin avisos → se entera solo si dejó la pestaña abierta.
 *  no       nunca abrió el QR → no hay por dónde avisarle.
 *
 * Sale de dos datos que ya existían y que el mostrador no veía hasta después
 * de tocar "Listo", cuando el toast le avisaba que llamara al cliente. */
type Aviso = "ok" | "pantalla" | "no";

const avisoDe = (order: OrderView): Aviso => {
  if (!order.seenAt) return "no";
  return order.hasPush ? "ok" : "pantalla";
};

const AVISO_CLASS: Record<Aviso, string> = {
  ok: "border-ok-borde bg-ok-fondo text-ok",
  pantalla: "border-carbon/15 bg-carbon/[0.04] text-carbon/60",
  no: "border-alerta-borde bg-alerta-fondo text-alerta",
};

const AVISO_KEY: Record<Aviso, string> = {
  ok: "card.avisoOk",
  pantalla: "card.avisoPantalla",
  no: "card.avisoNo",
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
  /* Mostrador QR: cobrar en caja un pedido que no está pago. */
  onCobrar?: (order: OrderView) => void;
}

/* Mostrador QR: cómo está el pago, aparte de la preparación. */
type PagoMostrador = "pagado" | "caja" | "mercado_pago" | "sin-pagar";

const pagoMostrador = (o: OrderView): PagoMostrador => {
  if (o.paidMethod) return "pagado";
  if (o.mpPending) return "mercado_pago";
  if (o.payAtCounterAt) return "caja";
  return "sin-pagar";
};

const PAGO_CLASS: Record<PagoMostrador, string> = {
  pagado: "bg-ok-fondo text-ok",
  caja: "bg-curso-fondo text-curso",
  mercado_pago: "bg-curso-fondo text-curso",
  "sin-pagar": "bg-alerta-fondo text-alerta",
};

export const OrderCard = ({
  pedido: order,
  index = 0,
  onCambiarEstado,
  onMostrarQr,
  onReavisar,
  onCobrar,
}: Props) => {
  const { t, locale } = useApp();
  const confirmar = useConfirm();
  const mode = useConfigStore((s) => s.modo);
  const [now, setNow] = useState(() => Date.now());
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (orderClosed(order.status)) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [order.status]);

  /* Un pedido de la mesa (modalidad Mesa) espera desde que quedó pago: antes
   * de eso no era trabajo de nadie. */
  const mesa = Boolean(order.selfService);
  /* Mostrador QR: sin mesa, y el pedido puede estar listo sin estar pago. */
  const mostradorQr = Boolean(order.counterQr);
  const pago = mostradorQr ? pagoMostrador(order) : null;
  const wait = minutosDesde(mesa ? (order.confirmedAt ?? order.createdAt) : order.createdAt, now);
  const enCurso =
    order.status === "creado" || order.status === "en_preparacion";
  const listo = order.status === "listo";
  const cerrado = orderClosed(order.status);
  const urgente = wait !== null && wait >= 15 && !cerrado;
  const aviso = avisoDe(order);

  const porCobrar = pago !== null && pago !== "pagado" && !cerrado;

  const cambiar = async (status: OrderStatus) => {
    if (busy) return;
    /* Entregar sin cobrar es posible (el local decide), pero no por un toque
     * distraído: el pedido todavía debe la plata. */
    if (status === "retirado" && porCobrar) {
      const ok = await confirmar({
        title: t("mostradorQr.panel.entregarSinCobrarTitulo"),
        body: t("mostradorQr.panel.entregarSinCobrarCuerpo", {
          n: order.reference,
          total: formatMoney(order.total ?? 0),
        }),
        confirmLabel: t("mostradorQr.panel.entregarSinCobrarSi"),
        cancelLabel: t("acciones.volver"),
        tone: "peligro",
      });
      if (!ok) return;
    }
    setBusy(true);
    void Promise.resolve(onCambiarEstado(order.id, status)).finally(() => {
      setBusy(false);
    });
  };

  return (
    <article
      className={`flex flex-col gap-4 rounded-[28px] border bg-surface p-5 shadow-sm transition duration-200 ${
        listo
          ? "border-ok-borde ring-2 ring-ok-borde"
          : order.status === "cancelado"
            ? "border-linea opacity-70"
            : urgente
              ? "border-curso-borde"
              : "border-linea"
      }`}
      style={{ animationDelay: `${0.05 + index * 0.04}s` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-carbon/40">
            {mostradorQr
              ? t("mostradorQr.panel.etiqueta")
              : mesa
                ? t("retiroCaja.pedidoDeMesa", { n: order.tableNumber ?? "—" })
                : t(`modo.${mode}`)}
          </p>
          <div className="grid min-h-8 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2">
            <span className="font-display text-3xl leading-none text-carbon">
              {order.reference}
            </span>
            {mostradorQr && !order.alias ? (
              <span className="truncate text-sm leading-tight text-carbon/45">
                {t("mostradorQr.panel.sinNombre")}
              </span>
            ) : order.alias ? (
              /* `leading-tight` y no `leading-none`: `truncate` es
               * `overflow:hidden`, y con la caja del alto exacto de la letra la
               * panza de la "g" de un nombre como Miguel queda cortada. El
               * número de al lado no tiene descendentes, así que el corte solo
               * se ve en el alias. */
              <span className="truncate font-display text-lg leading-tight text-marca">
                {order.alias}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
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
          {/* En un pedido cerrado ya no hay nada que decidir, así que no se
              muestra: es información para antes de tocar "Listo". */}
          {!cerrado && (
            <span
              title={t(`${AVISO_KEY[aviso]}Det`)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${AVISO_CLASS[aviso]}`}
            >
              <span className="size-1.5 shrink-0 rounded-full bg-current opacity-70" />
              {t(AVISO_KEY[aviso])}
            </span>
          )}
        </div>
      </div>

      {/* Lo que hay que preparar. Un pedido del mostrador no trae ítems (la
          caja lo anota a su manera); el de la mesa sí, porque nadie lo cargó. */}
      {mesa && (
        <div className="flex flex-col gap-2 rounded-2xl border border-linea bg-crema/40 p-3">
          <ul className="flex flex-col gap-0.5 text-sm text-carbon">
            {(order.items ?? []).map((i, n) => (
              <li key={`${i.name}-${n}`}>
                <span className="font-semibold tabular-nums">{i.quantity} ×</span> {i.name}
              </li>
            ))}
          </ul>
          <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-carbon/55">
            {pago ? (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${PAGO_CLASS[pago]}`}
              >
                {pago === "pagado"
                  ? t("mostradorQr.panel.pagado", {
                      m: t(`mesa.metodo.${order.paidMethod}`),
                    })
                  : t(`mostradorQr.panel.pendiente.${pago}`)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-ok-fondo px-2 py-0.5 font-semibold text-ok">
                {t("retiroCaja.pagado")}
                {order.paidMethod ? ` · ${t(`mesa.metodo.${order.paidMethod}`)}` : ""}
              </span>
            )}
            {order.total != null && (
              <span className="font-semibold tabular-nums text-carbon/70">
                {formatMoney(order.total)}
              </span>
            )}
          </p>
        </div>
      )}

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
                urgente ? "text-curso" : "text-carbon/75"
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
          onClick={() => void cambiar("listo")}
          className="w-full rounded-full bg-emerald-600 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.97] disabled:opacity-50 sm:py-3"
        >
          {busy ? "…" : t("card.marcarListo")}
        </button>
      )}
      {porCobrar && onCobrar && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onCobrar(order)}
          className={`w-full rounded-full px-4 py-3.5 text-sm font-semibold transition active:scale-[0.97] disabled:opacity-50 sm:py-3 ${
            listo
              ? "bg-marca text-crema hover:bg-marca-fuerte"
              : "border-2 border-marca text-marca hover:bg-marca/5"
          }`}
        >
          {t("retiroCaja.cobrar", { n: formatMoney(order.total ?? 0) })}
        </button>
      )}
      {listo && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void cambiar("retirado")}
          className={`w-full rounded-full px-4 py-3.5 text-sm font-semibold transition active:scale-[0.97] disabled:opacity-50 sm:py-3 ${
            porCobrar
              ? "border border-linea text-carbon/70 hover:bg-carbon/5"
              : "bg-marca text-crema hover:bg-marca-fuerte"
          }`}
        >
          {busy ? "…" : t("card.marcarRetirado")}
        </button>
      )}
      {listo && onReavisar && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onReavisar(order.id)}
          className="w-full min-h-11 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/70 transition hover:bg-carbon/5 active:scale-[0.97] disabled:opacity-50"
        >
          {locale === "en" ? "Notify again" : "Volver a avisar"}
        </button>
      )}

      {(enCurso || listo) &&
        (confirmCancel ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-alerta-borde bg-alerta-fondo p-2">
            <p className="px-1 text-center text-xs font-medium text-alerta">
              {mesa && !porCobrar ? t("retiroCaja.cancelarPagado") : t("card.confirmarCancel")}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void cambiar("cancelado");
                  setConfirmCancel(false);
                }}
                className="flex min-h-11 flex-1 items-center justify-center rounded-full bg-red-500 px-4 text-sm font-semibold text-white transition hover:bg-red-600 active:scale-[0.97] disabled:opacity-50"
              >
                {locale === "en" ? "Yes, cancel" : "Sí, cancelar"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                className="flex min-h-11 flex-1 items-center justify-center rounded-full border border-linea bg-surface px-4 text-sm font-semibold text-carbon/60 transition hover:bg-carbon/5"
              >
                {locale === "en" ? "Keep it" : "No, dejarlo"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            {onMostrarQr && !cerrado && !mesa && (
              <button
                type="button"
                onClick={() => onMostrarQr(order)}
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-semibold text-carbon/55 transition hover:bg-carbon/5"
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
                  aria-hidden
                >
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <path d="M14 14h3v3M20 20v.01M14 20v.01M20 14v.01" />
                </svg>
                {t("qr.verQr")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              className="flex min-h-11 flex-1 items-center justify-center rounded-full text-sm font-semibold text-alerta transition hover:bg-alerta-fondo"
            >
              {t("card.marcarCancelado")}
            </button>
          </div>
        ))}
    </article>
  );
};
