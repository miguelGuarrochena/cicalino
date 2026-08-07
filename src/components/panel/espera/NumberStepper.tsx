"use client";

/* Extraído de app/(app)/panel/espera/page.tsx. Movido tal cual. */

export const NumberStepper = ({
  value,
  onChange,
  min = 1,
  max = 50,
  accent = "espera",
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  accent?: "espera" | "marca";
}) => {
  const btn =
    accent === "espera"
      ? "border-espera/40 text-espera active:bg-espera active:text-crema"
      : "border-marca/40 text-marca active:bg-marca active:text-crema";
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className="flex w-full items-center gap-3">
      <button
        type="button"
        aria-label="−"
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className={`flex size-12 shrink-0 items-center justify-center rounded-2xl border-2 text-2xl font-bold transition disabled:opacity-30 ${btn}`}
      >
        −
      </button>
      <div className="flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-linea bg-crema/50 font-display text-3xl text-carbon">
        {value}
      </div>
      <button
        type="button"
        aria-label="+"
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className={`flex size-12 shrink-0 items-center justify-center rounded-2xl border-2 text-2xl font-bold transition disabled:opacity-30 ${btn}`}
      >
        +
      </button>
    </div>
  );
};
