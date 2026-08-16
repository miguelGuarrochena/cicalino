"use client";

/* Extraído de app/(app)/panel/espera/page.tsx. Movido tal cual.
 *
 * El guardado y el aviso quedan en el padre: acá solo se elige el número. Así
 * el modal no necesita conocer ni la capa de datos ni el toast. */

import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { NumberStepper } from "@/components/panel/espera/NumberStepper";

const CAPACIDADES_RAPIDAS = [2, 4, 6, 8, 10] as const;

export const CapacidadMesaModal = ({
  numero,
  value,
  onValue,
  onGuardar,
  onClose,
  locale,
}: {
  numero: number;
  value: number;
  onValue: (n: number) => void;
  onGuardar: () => void;
  onClose: () => void;
  locale: string;
}) => {
  const es = locale !== "en";
  return (
    <ModalShell
      onClose={onClose}
      labelledBy="capacidad-title"
      footer={
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onGuardar}
            className="w-full rounded-full bg-espera px-5 py-3.5 text-sm font-semibold text-crema transition hover:bg-espera-fuerte"
          >
            {es ? "Guardar" : "Save"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full border border-linea px-5 py-3.5 text-sm font-semibold text-carbon transition hover:bg-crema"
          >
            {es ? "Cancelar" : "Cancel"}
          </button>
        </div>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          id="capacidad-title"
          className="font-display text-xl uppercase tracking-tight text-carbon"
        >
          {es ? `Plazas mesa ${numero}` : `Table ${numero} seats`}
        </h2>
        <ModalCloseBtn onClick={onClose} label={es ? "Cerrar" : "Close"} />
      </div>
      <p className="mt-2 text-sm text-carbon/55">
        {es
          ? "¿Cuántas personas entran en esta mesa?"
          : "How many guests fit at this table?"}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {CAPACIDADES_RAPIDAS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onValue(n)}
            className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
              value === n
                ? "bg-espera text-crema"
                : "border border-linea text-carbon/70 hover:bg-crema"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <NumberStepper value={value} onChange={onValue} min={1} max={50} />
      </div>
    </ModalShell>
  );
};
