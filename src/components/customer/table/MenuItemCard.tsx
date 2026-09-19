"use client";

import { useApp } from "@/components/providers/Providers";
import { formatMoney } from "@/lib/tableBill";
import type { GuestMenuProduct } from "@/components/customer/table/TableGuestApp";

/* Un plato de la carta.
 *
 * Estaba escrito adentro de la pantalla, que ya hacía todo lo demás. Sale acá
 * porque ahora se dibuja en dos lugares —la carta por categorías y los
 * resultados de la búsqueda— y tiene que verse y comportarse igual en los dos:
 * el `+` suma lo mismo desde donde sea que lo toques.
 *
 * La foto es opcional y sigue siéndolo: sin `imageUrl` no se dibuja nada, ni
 * caja gris ni foto genérica, y el texto se queda con el ancho entero. */
export const MenuItemCard = ({
  producto,
  cantidad,
  categoria,
  puedePedir,
  onCantidad,
}: {
  producto: GuestMenuProduct;
  cantidad: number;
  /* Solo en los resultados de búsqueda: de dónde salió este plato. En la carta
   * sobra, porque el título de la sección ya está a la vista. */
  categoria?: string;
  puedePedir: boolean;
  onCantidad: (q: number) => void;
}) => {
  const { t } = useApp();
  return (
    <li className="flex gap-3 rounded-2xl border border-linea bg-surface p-3.5">
      {producto.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={producto.imageUrl}
          alt=""
          className="size-16 shrink-0 rounded-xl object-cover"
        />
      ) : null}
      {/* El precio y los controles van en su propia fila: con los botones en
          44 px, al nombre le quedaban 99 px en un teléfono de 375. */}
      <div className="min-w-0 flex-1">
        {categoria ? (
          <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-suave">
            {categoria}
          </p>
        ) : null}
        <p className="text-lg font-semibold leading-snug text-carbon">{producto.name}</p>
        {producto.description && (
          <p className="mt-1 text-[0.9375rem] leading-relaxed text-suave">
            {producto.description}
          </p>
        )}
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-lg font-bold tabular-nums text-marca">
            {formatMoney(producto.price)}
          </p>
          {puedePedir && (
            <div className="flex shrink-0 items-center gap-1">
              {cantidad > 0 && (
                <>
                  <button
                    type="button"
                    aria-label={t("mesa.quitarUno", { n: producto.name })}
                    onClick={() => onCantidad(cantidad - 1)}
                    className="grid size-11 place-items-center rounded-full border-2 border-linea text-2xl leading-none text-carbon"
                  >
                    −
                  </button>
                  <span
                    className="w-8 text-center text-lg font-bold tabular-nums text-carbon"
                    aria-live="polite"
                  >
                    {cantidad}
                  </span>
                </>
              )}
              <button
                type="button"
                aria-label={t("mesa.agregarUno", { n: producto.name })}
                onClick={() => onCantidad(cantidad + 1)}
                className="grid size-11 place-items-center rounded-full bg-marca text-2xl leading-none text-crema"
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
};
