"use client";

import { useApp } from "@/components/providers/Providers";
import { CustomerEmpty } from "@/components/customer/CustomerEmpty";
import { CustomerNotice } from "@/components/customer/CustomerNotice";
import type { BillOrder } from "@/lib/tableBill";
import type { OrderStatus } from "@/lib/types";

/* Los pedidos que ya salieron de la mesa.
 *
 * Acá no se edita nada, y esa es la diferencia con la revisión: lo de esta
 * lista ya lo tiene el local. Los `+`/`−` no existen, y lo único que se puede
 * hacer —cancelar mientras todavía no lo anotaron— es la regla que ya estaba,
 * sin tocar.
 *
 * Cuando además hay algo en preparación, lo primero que se ve es eso: con dos
 * listas parecidas en la misma pantalla, lo peor que puede pasar es creer que
 * lo de abajo ya se mandó. */
const ORDER_GLYPH: Record<OrderStatus, React.ReactNode> = {
  creado: <path d="M12 7v5l3 2" />,
  en_preparacion: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  listo: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  retirado: <path d="m4 12.5 4 4 5-5M11 16.5l4 4 5-5" />,
  cancelado: <path d="m8 8 8 8M16 8l-8 8" />,
};

export const OrderStatusChip = ({ status }: { status: OrderStatus }) => {
  const { t } = useApp();
  /* Cinco estados que antes se distinguían solo por el color del fondo. Ahora
   * cada uno trae su forma, para que se lean con poca luz o de reojo. */
  const cls =
    status === "listo"
      ? "border-ok-borde bg-ok-fondo text-carbon"
      : status === "retirado"
        ? "border-linea bg-carbon/5 text-suave"
        : status === "cancelado"
          ? "border-alerta-borde bg-alerta-fondo text-carbon"
          : "border-curso-borde bg-curso-fondo text-carbon";
  return (
    <span
      className={`inline-flex min-h-10 items-center gap-2 rounded-full border-2 px-3.5 text-base font-bold ${cls}`}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0"
      >
        {status === "creado" ? <circle cx="12" cy="12" r="9" /> : null}
        {ORDER_GLYPH[status]}
      </svg>
      {t(`mesa.estadoPedido.${status}`)}
    </span>
  );
};

export const SentOrders = ({
  pedidos,
  itemsSinEnviar,
  mesaAbierta,
  ocupado,
  onVerPedido,
  onCancelar,
}: {
  pedidos: BillOrder[];
  /* Lo que todavía está en preparación, para no confundirlo con lo de abajo. */
  itemsSinEnviar: number;
  mesaAbierta: boolean;
  ocupado: boolean;
  onVerPedido: () => void;
  onCancelar: (orderId: string) => void;
}) => {
  const { t } = useApp();

  return (
    <section className="mt-5 flex flex-col gap-4">
      {itemsSinEnviar > 0 && (
        <CustomerNotice tone="curso">
          <p className="font-bold">
            {itemsSinEnviar === 1
              ? t("mesa.sinEnviarUno")
              : t("mesa.sinEnviarN", { n: itemsSinEnviar })}
          </p>
          <p className="mt-1 leading-snug">{t("mesa.sinEnviarAyuda")}</p>
          <button
            type="button"
            onClick={onVerPedido}
            className="mt-2.5 inline-flex min-h-11 items-center rounded-full border-2 border-marca px-4 text-base font-semibold text-marca"
          >
            {t("mesa.revisarlo")}
          </button>
        </CustomerNotice>
      )}

      {!pedidos.length ? (
        <CustomerEmpty
          conMascota={itemsSinEnviar === 0}
          titulo={t("mesa.sinPedidos")}
          cuerpo={t("mesa.sinPedidosAyuda")}
        />
      ) : (
        <>
          <div>
            <h2 className="font-display text-xl uppercase tracking-tight text-carbon">
              {t("mesa.yaEnviados")}
            </h2>
            <p className="mt-1 text-base leading-relaxed text-suave">
              {t("mesa.pedidosAyuda")}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {pedidos
              .slice()
              .reverse()
              .map((o) => (
                <article key={o.id} className="rounded-2xl border border-linea bg-surface p-3.5">
                  {/* El estado va primero y grande: es lo que se viene a
                      mirar. La hora es el dato de apoyo, no al revés. */}
                  <p className="flex flex-wrap items-center justify-between gap-2">
                    <OrderStatusChip status={o.status} />
                    <span className="text-sm tabular-nums text-suave">
                      {new Date(o.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </p>
                  <ul className="mt-2.5 flex flex-col gap-1.5 text-base text-carbon">
                    {o.items.map((i) => (
                      <li key={i.id}>
                        <span className="font-semibold tabular-nums">{i.quantity} ×</span> {i.name}
                      </li>
                    ))}
                  </ul>
                  {o.status === "creado" && mesaAbierta ? (
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => onCancelar(o.id)}
                      className="mt-3 min-h-11 rounded-full border-2 border-alerta-borde px-4 text-base font-semibold text-carbon disabled:opacity-50"
                    >
                      {t("mesa.cancelarPedido")}
                    </button>
                  ) : o.status === "en_preparacion" || o.status === "listo" ? (
                    <p className="mt-3 text-sm text-suave">{t("mesa.yaAnotadoAyuda")}</p>
                  ) : null}
                </article>
              ))}
          </div>
        </>
      )}
    </section>
  );
};
