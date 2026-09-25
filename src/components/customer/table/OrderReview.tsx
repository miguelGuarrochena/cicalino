"use client";

import { useApp } from "@/components/providers/Providers";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { Spinner } from "@/components/ui/Spinner";
import { CustomerEmpty } from "@/components/customer/CustomerEmpty";
import { CustomerNotice } from "@/components/customer/CustomerNotice";
import { formatMoney } from "@/lib/tableBill";
import { itemsCarrito, totalCarrito, type CartLine } from "@/lib/cart";

/* Lo que estás por mandar, antes de mandarlo.
 *
 * Esta pantalla no existía. El botón decía "Pedir 2 · $19.600" y con un toque
 * el pedido estaba en la cocina: sin ver qué llevaba, sin poder corregir una
 * cantidad, sin deshacer. Las únicas cantidades visibles estaban desperdigadas
 * al lado de cada plato, treinta tarjetas más arriba.
 *
 * Va sobre `ModalShell` a propósito, y no como una pantalla aparte: encima de
 * la carta, "volver a seguir agregando" es cerrar —el scroll de la carta queda
 * donde estaba, sin estado de navegación que administrar— y el foco, el
 * Escape, el bloqueo de scroll y la devolución del foco ya están resueltos ahí.
 *
 * El envío tiene tres momentos y cada uno es una cara distinta de esta misma
 * hoja: lo que vas a mandar, el envío en curso y lo que quedó mandado. Que el
 * cartel de "listo" aparezca donde estaba el botón, y no arriba de todo en una
 * pestaña a la que te acaban de mover, es la diferencia entre enterarte y
 * suponer. */
export const OrderReview = ({
  lineas,
  enviando,
  error,
  enviado,
  puedePedir,
  onCantidad,
  onEnviar,
  onSeguirPidiendo,
  onVerPedidos,
  onClose,
  enviarLabel,
  enviarAyuda,
}: {
  lineas: CartLine[];
  enviando: boolean;
  error: string | null;
  /* Lo que se acaba de mandar. Se guarda al salir porque el carrito ya se
   * vació: sin esto la hoja de "listo" quedaría en blanco. */
  enviado: CartLine[] | null;
  puedePedir: boolean;
  onCantidad: (id: string, q: number) => void;
  onEnviar: () => void;
  onSeguirPidiendo: () => void;
  onVerPedidos: () => void;
  onClose: () => void;
  /* Pedidos en modalidad Mesa: el botón no manda a la cocina, lleva a elegir
   * cómo pagar. Cambia lo que dice y lo que explica, no lo que hace. */
  enviarLabel?: string;
  enviarAyuda?: string;
}) => {
  const { t } = useApp();
  const total = totalCarrito(lineas);
  const items = itemsCarrito(lineas);

  if (enviado) {
    return (
      <ModalShell onClose={onClose} labelledBy="review-title">
        <div className="flex items-start justify-between gap-3">
          <h2 id="review-title" className="font-display text-2xl uppercase text-marca">
            {t("mesa.pedidoEnviadoTitulo")}
          </h2>
          <ModalCloseBtn onClick={onClose} label={t("mesa.cerrar")} />
        </div>
        <div className="mt-4 flex flex-col gap-4">
          <CustomerNotice tone="ok">{t("mesa.pedidoEnviado")}</CustomerNotice>
          <ul className="flex flex-col gap-2">
            {enviado.map((l) => (
              <li
                key={l.producto.id}
                className="flex items-baseline justify-between gap-3 border-b border-linea/60 pb-2 text-base text-carbon last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="font-semibold tabular-nums">{l.cantidad} ×</span>{" "}
                  {l.producto.name}
                </span>
                <span className="shrink-0 tabular-nums">{formatMoney(l.subtotal)}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onSeguirPidiendo}
              className="min-h-14 w-full rounded-full bg-marca px-5 text-base font-semibold text-crema"
            >
              {t("mesa.seguirPidiendo")}
            </button>
            <button
              type="button"
              onClick={onVerPedidos}
              className="min-h-14 w-full rounded-full border-2 border-marca px-5 text-base font-semibold text-marca"
            >
              {t("mesa.verMisPedidos")}
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  const vacio = lineas.length === 0;

  const footer = vacio ? (
    <button
      type="button"
      onClick={onSeguirPidiendo}
      className="min-h-14 w-full rounded-full bg-marca px-5 text-base font-semibold text-crema"
    >
      {t("mesa.seguirPidiendo")}
    </button>
  ) : (
    <div className="flex flex-col gap-2.5">
      {/* El aviso vive pegado al botón que lo produjo, no arriba de la
          pantalla: es donde está mirando quien acaba de tocar "Enviar". */}
      {error && (
        <CustomerNotice tone="alerta" role="alert">
          {error}
        </CustomerNotice>
      )}
      {/* El total va acá y no en la lista: con tres renglones largos quedaba
          abajo del pliegue, y es el número que hay que ver justo antes de
          decidir. Al lado del botón, no se puede no verlo. */}
      <p className="flex flex-wrap items-baseline justify-between gap-2 text-base font-semibold text-carbon">
        {t("mesa.totalPedido")}
        <span className="font-display text-2xl tabular-nums text-marca">
          {formatMoney(total)}
        </span>
      </p>
      <button
        type="button"
        onClick={onEnviar}
        disabled={enviando || !puedePedir}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-marca px-5 text-base font-semibold text-crema disabled:opacity-50"
      >
        {enviando && <Spinner inline className="size-4" />}
        {enviando ? t("mesa.enviandoPedido") : (enviarLabel ?? t("mesa.enviarPedido"))}
      </button>
      {/* Que el botón diga "Enviar pedido" no alcanza: hace falta decir a
          dónde va y qué pasa después. */}
      <p className="text-center text-sm leading-snug text-suave">
        {enviarAyuda ?? t("mesa.enviarPedidoAyuda")}
      </p>
    </div>
  );

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="review-title"
      busy={enviando}
      busyLabel={t("mesa.enviandoPedido")}
      footer={footer}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="review-title" className="font-display text-2xl uppercase text-marca">
            {t("mesa.tuPedido")}
          </h2>
          {!vacio && (
            <p className="mt-1 text-base text-suave">
              {items === 1 ? t("mesa.itemUno") : t("mesa.itemsN", { n: items })}
            </p>
          )}
        </div>
        <ModalCloseBtn onClick={onClose} disabled={enviando} label={t("mesa.cerrar")} />
      </div>

      {vacio ? (
        <div className="mt-6">
          <CustomerEmpty titulo={t("mesa.pedidoVacio")} cuerpo={t("mesa.pedidoVacioAyuda")} />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <ul className="flex flex-col gap-2.5">
            {lineas.map((l) => (
              <li
                key={l.producto.id}
                className="rounded-2xl border border-linea bg-crema/50 p-3.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 text-lg font-semibold leading-snug text-carbon">
                    {l.producto.name}
                  </p>
                  <p className="shrink-0 text-lg font-bold tabular-nums text-carbon">
                    {formatMoney(l.subtotal)}
                  </p>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <p className="text-base tabular-nums text-suave">
                    {t("mesa.unitario1", { n: formatMoney(l.producto.price) })}
                  </p>
                  {puedePedir && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label={
                          l.cantidad === 1
                            ? t("mesa.quitarDelPedido", { n: l.producto.name })
                            : t("mesa.quitarUno", { n: l.producto.name })
                        }
                        onClick={() => onCantidad(l.producto.id, l.cantidad - 1)}
                        className="grid size-11 place-items-center rounded-full border-2 border-linea text-2xl leading-none text-carbon"
                      >
                        {/* En uno, el `−` es un borrado: conviene que se vea
                            como tal antes de tocarlo, no después. */}
                        {l.cantidad === 1 ? (
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
                          >
                            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                          </svg>
                        ) : (
                          "−"
                        )}
                      </button>
                      <span
                        className="w-8 text-center text-lg font-bold tabular-nums text-carbon"
                        aria-live="polite"
                      >
                        {l.cantidad}
                      </span>
                      <button
                        type="button"
                        aria-label={t("mesa.agregarUno", { n: l.producto.name })}
                        onClick={() => onCantidad(l.producto.id, l.cantidad + 1)}
                        className="grid size-11 place-items-center rounded-full bg-marca text-2xl leading-none text-crema"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={onSeguirPidiendo}
            className="min-h-12 w-full rounded-full border-2 border-linea px-5 text-base font-semibold text-carbon"
          >
            {t("mesa.agregarMas")}
          </button>
        </div>
      )}
    </ModalShell>
  );
};
