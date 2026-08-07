"use client";

/* Extraído de app/(app)/panel/espera/page.tsx. Movido tal cual. */

import { NumberStepper } from "./NumberStepper";

export const PERSONAS_CHIPS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export const PersonasChips = ({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) => {
  const otro = value > 8;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {PERSONAS_CHIPS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`flex size-11 items-center justify-center rounded-xl text-sm font-bold transition active:scale-95 ${
              !otro && value === n
                ? "bg-espera text-crema"
                : "border border-linea bg-crema/40 text-carbon hover:border-espera/40"
            }`}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange(Math.max(9, value > 8 ? value : 9))}
          className={`flex h-11 min-w-11 items-center justify-center rounded-xl px-3 text-sm font-bold transition active:scale-95 ${
            otro
              ? "bg-espera text-crema"
              : "border border-linea bg-crema/40 text-carbon hover:border-espera/40"
          }`}
        >
          9+
        </button>
      </div>
      {otro && (
        <NumberStepper value={value} onChange={onChange} min={9} max={50} />
      )}
    </div>
  );
};
