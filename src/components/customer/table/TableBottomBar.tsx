"use client";

import { useApp } from "@/components/providers/Providers";
import { formatMoney } from "@/lib/tableBill";

/* La barra de abajo: lo que se puede hacer ahora, al alcance del pulgar.
 *
 * Tiene una regla nueva y una sola: cuando hay algo sin enviar, el pedido se
 * queda con la barra, esté donde esté la persona. Antes el botón del carrito
 * aparecía solo en la pestaña Carta — si te ibas a Cuenta con tres cosas sin
 * mandar, desaparecían de la vista y había que acordarse de volver.
 *
 * Y ya no manda nada: abre la revisión. Mandar a la cocina pasó a ser una
 * decisión que se toma mirando el pedido, no un botón que se toca de paso. */
export const TableBottomBar = ({
  tab,
  items,
  total,
  hayConsumo,
  faltaPagar,
  onVerPedido,
  onVerCuenta,
  onVerCarta,
  onPagar,
}: {
  tab: "carta" | "pedidos" | "cuenta";
  /* Unidades sin enviar. Cero = no hay pedido en preparación. */
  items: number;
  total: number;
  hayConsumo: boolean;
  faltaPagar: boolean;
  onVerPedido: () => void;
  onVerCuenta: () => void;
  onVerCarta: () => void;
  onPagar: () => void;
}) => {
  const { t } = useApp();

  const primario = "min-h-14 flex-1 rounded-full bg-marca px-4 text-base font-semibold text-crema";
  const secundario =
    "min-h-14 rounded-full border-2 border-marca px-4 text-base font-semibold text-marca";

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-linea bg-surface/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur">
      <div className="mx-auto flex max-w-lg gap-2">
        {items > 0 ? (
          <>
            <button
              type="button"
              onClick={onVerPedido}
              className={`${primario} flex items-center justify-center gap-2`}
            >
              {/* El número va en su propia cápsula: de un vistazo, cuántas
                  cosas hay. La plata al lado, para que nadie tenga que abrir
                  para saber en cuánto va. */}
              <span className="grid min-h-7 min-w-7 shrink-0 place-items-center rounded-full bg-crema px-1.5 text-sm font-bold tabular-nums text-marca">
                {items}
              </span>
              {t("mesa.verPedido")}
              <span className="tabular-nums">{formatMoney(total)}</span>
            </button>
            {hayConsumo && (
              <button type="button" onClick={onVerCuenta} className={secundario}>
                {t("mesa.tab.cuenta")}
              </button>
            )}
          </>
        ) : tab === "cuenta" ? (
          <>
            <button
              type="button"
              onClick={onVerCarta}
              className={`${secundario} flex-1`}
            >
              {t("mesa.seguirPidiendo")}
            </button>
            {faltaPagar && (
              <button type="button" onClick={onPagar} className={primario}>
                {t("mesa.pedirCuenta")}
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onVerCuenta}
              className={`${secundario} flex-1`}
            >
              {t("mesa.verCuenta")}
            </button>
            {faltaPagar && (
              <button type="button" onClick={onPagar} className={primario}>
                {t("mesa.pedirCuenta")}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
