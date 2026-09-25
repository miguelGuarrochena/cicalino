"use client";

import { useApp } from "@/components/providers/Providers";
import { CustomerNotice } from "@/components/customer/CustomerNotice";
import { Spinner } from "@/components/ui/Spinner";
import { formatMoney } from "@/lib/tableBill";
import {
  pickupActive,
  pickupPaying,
  pickupPaymentFailed,
  pickupStage,
  type PickupOrder,
  type PickupStage,
} from "@/lib/tablePickup";

/* Un pedido del cliente, con el estado grande arriba.
 *
 * Lo primero que se lee es qué pasa ahora ("Esperando pago", "En
 * preparación", "Listo para retirar") y, justo abajo, lo único que el cliente
 * puede hacer en ese momento. El resto (ítems, total) va chico: ya lo eligió. */

const STAGE_TONE: Record<PickupStage, string> = {
  "esperando-pago": "border-curso-borde bg-curso-fondo text-curso",
  "en-preparacion": "border-marca/30 bg-marca/10 text-marca",
  listo: "border-ok-borde bg-ok-fondo text-ok",
  retirado: "border-linea bg-carbon/5 text-suave",
  cancelado: "border-linea bg-carbon/5 text-suave",
};

export const PickupOrderCard = ({
  order,
  tableNumber,
  mercadoPagoReady,
  busy,
  flash = false,
  onPayMercadoPago,
  onPayAtCounter,
  onCancel,
}: {
  order: PickupOrder;
  tableNumber: number;
  mercadoPagoReady: boolean;
  busy: boolean;
  flash?: boolean;
  onPayMercadoPago: () => void;
  onPayAtCounter: () => void;
  onCancel: () => void;
}) => {
  const { t } = useApp();
  const stage = pickupStage(order.status);
  const paying = pickupPaying(order);
  const failed = pickupPaymentFailed(order);
  const active = pickupActive(order.status);
  const waiting = stage === "esperando-pago";

  return (
    <article
      className={`rounded-3xl border-2 bg-surface p-4 shadow-sm ${
        stage === "listo" ? "border-ok-borde" : "border-linea"
      } ${flash ? "u-alert-beat u-alert-halo" : ""} ${active ? "" : "opacity-75"}`}
      aria-live={active ? "polite" : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-wide text-suave">
            {t("retiro.pedidoN", { n: order.reference })}
          </p>
          <p
            className={`mt-1.5 inline-flex items-center rounded-full border px-3 py-1 text-base font-bold ${STAGE_TONE[stage]}`}
          >
            {t(`retiro.estado.${stage}`)}
          </p>
        </div>
        <p className="shrink-0 font-display text-2xl tabular-nums text-carbon">
          {formatMoney(order.total)}
        </p>
      </div>

      {stage === "listo" && (
        <CustomerNotice tone="ok" className="mt-3">
          <p className="font-semibold">{t("retiro.listoTitulo")}</p>
          <p className="mt-0.5">
            {t("retiro.listoCuerpo", { n: order.reference, m: tableNumber })}
          </p>
        </CustomerNotice>
      )}

      {stage === "en-preparacion" && (
        <p className="mt-3 text-base leading-snug text-carbon">{t("retiro.preparandoCuerpo")}</p>
      )}

      {waiting && (
        <div className="mt-3 flex flex-col gap-2.5">
          {paying === "caja" ? (
            <CustomerNotice tone="curso">
              <p className="font-semibold">{t("retiro.cajaTitulo")}</p>
              <p className="mt-0.5">
                {t("retiro.cajaCuerpo", {
                  n: order.reference,
                  m: tableNumber,
                  total: formatMoney(order.total),
                })}
              </p>
            </CustomerNotice>
          ) : paying === "mercado_pago" ? (
            <CustomerNotice tone="curso">
              <span className="flex items-center gap-2">
                <Spinner inline className="size-4" /> {t("retiro.mpEsperando")}
              </span>
            </CustomerNotice>
          ) : (
            <CustomerNotice tone={failed ? "alerta" : "curso"}>
              {failed ? t("retiro.mpNoAprobado") : t("retiro.elegiComoPagar")}
            </CustomerNotice>
          )}
          <p className="text-sm leading-snug text-suave">{t("retiro.seCocinaAlPagar")}</p>

          {mercadoPagoReady && (
            <button
              type="button"
              disabled={busy}
              onClick={onPayMercadoPago}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-marca px-5 text-base font-semibold text-crema disabled:opacity-50"
            >
              {busy && <Spinner inline className="size-4" />}
              {paying === "mercado_pago"
                ? t("retiro.irAMercadoPago")
                : t("retiro.pagarMp", { n: formatMoney(order.total) })}
            </button>
          )}
          {paying !== "caja" && (
            <button
              type="button"
              disabled={busy}
              onClick={onPayAtCounter}
              className="min-h-12 w-full rounded-full border-2 border-marca px-5 text-base font-semibold text-marca disabled:opacity-50"
            >
              {t("retiro.pagarEnCaja")}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-11 self-start rounded-full px-2 text-sm font-semibold text-alerta disabled:opacity-50"
          >
            {t("retiro.cancelarPedido")}
          </button>
        </div>
      )}

      <ul className="mt-3 flex flex-col gap-1 border-t border-linea/70 pt-3 text-base text-carbon">
        {order.items.map((i) => (
          <li key={i.id} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0">
              <span className="font-semibold tabular-nums">{i.quantity} ×</span> {i.name}
            </span>
            <span className="shrink-0 tabular-nums text-suave">{formatMoney(i.subtotal)}</span>
          </li>
        ))}
      </ul>
    </article>
  );
};
