"use client";

import { useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { formatMoney } from "@/lib/tableBill";
import { NOTA_MAX, notaAlEscribir } from "@/lib/dishChoice";
import { MAX_POR_PRODUCTO } from "@/lib/cart";
import type { GuestMenuProduct } from "@/components/customer/table/TableGuestApp";

/* El plato tiene tamaño o punto de cocción. Se elige una, se puede aclarar,
 * y se agrega. Sin esta hoja el `+` seguiría sumando a ciegas. */
export const DishChoiceSheet = ({
  producto,
  onAgregar,
  onClose,
}: {
  producto: GuestMenuProduct;
  onAgregar: (extra: { opcion: string; nota: string; cantidad: number }) => void;
  onClose: () => void;
}) => {
  const { t } = useApp();
  const choice = producto.choice;
  const [opcion, setOpcion] = useState(choice?.options[0]?.name ?? "");
  const [nota, setNota] = useState("");
  const [cantidad, setCantidad] = useState(1);
  if (!choice) return null;
  const elegida = choice.options.find((o) => o.name === opcion) ?? choice.options[0];

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="opcion-plato"
      footer={
        <button
          type="button"
          onClick={() => {
            if (!elegida) return;
            onAgregar({ opcion: elegida.name, nota, cantidad });
            onClose();
          }}
          className="min-h-14 w-full rounded-full bg-marca px-5 text-base font-semibold text-crema"
        >
          {t("mesa.agregarAlPedido")}
          {elegida ? ` · ${formatMoney(elegida.price * cantidad)}` : ""}
        </button>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="opcion-plato" className="font-display text-2xl uppercase text-marca">
          {producto.name}
        </h2>
        <ModalCloseBtn onClick={onClose} label={t("mesa.cerrar")} />
      </div>
      <p className="mt-3 text-base font-semibold text-carbon">{choice.question}</p>
      <div role="radiogroup" aria-label={choice.question} className="mt-2 flex flex-col gap-2">
        {choice.options.map((o) => {
          const on = o.name === elegida?.name;
          return (
            <button
              key={o.name}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setOpcion(o.name)}
              className={`flex min-h-14 items-center justify-between gap-3 rounded-2xl border-2 px-4 text-left text-base font-semibold ${
                on ? "border-marca bg-marca/10 text-carbon" : "border-linea bg-surface text-carbon"
              }`}
            >
              <span>{o.name}</span>
              <span className="shrink-0 tabular-nums text-marca">{formatMoney(o.price)}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-base font-semibold text-carbon">{t("mesa.cantidad")}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t("mesa.quitarUno", { n: producto.name })}
            onClick={() => setCantidad((n) => Math.max(1, n - 1))}
            className="grid size-11 place-items-center rounded-full border-2 border-linea text-2xl leading-none text-carbon"
          >
            −
          </button>
          <span className="w-8 text-center text-lg font-bold tabular-nums">{cantidad}</span>
          <button
            type="button"
            aria-label={t("mesa.agregarUno", { n: producto.name })}
            onClick={() => setCantidad((n) => Math.min(MAX_POR_PRODUCTO, n + 1))}
            className="grid size-11 place-items-center rounded-full bg-marca text-2xl leading-none text-crema"
          >
            +
          </button>
        </div>
      </div>
      <label className="mt-4 flex flex-col gap-1">
        <span className="text-sm font-semibold text-suave">{t("mesa.aclaracion")}</span>
        <input
          className="min-h-12 w-full rounded-xl border border-linea bg-crema/40 px-3 text-base text-carbon outline-none focus:border-marca"
          maxLength={NOTA_MAX}
          value={nota}
          placeholder={t("mesa.aclaracionPh")}
          onChange={(e) => setNota(notaAlEscribir(e.target.value))}
        />
      </label>
    </ModalShell>
  );
};
