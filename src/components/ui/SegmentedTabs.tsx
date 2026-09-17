"use client";

type Accent = "marca" | "espera";

export type SegmentedTab<T extends string> = {
  id: T;
  label: string;
  badge?: string | number;
};

export const SegmentedTabs = <T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  accent = "marca",
  size = "md",
}: {
  value: T;
  onChange: (id: T) => void;
  options: SegmentedTab<T>[];
  ariaLabel: string;
  accent?: Accent;
  size?: "sm" | "md";
}) => {
  const active =
    accent === "espera" ? "bg-espera text-crema shadow-sm" : "bg-marca text-crema shadow-sm";
  const pad = size === "sm" ? "min-h-9 px-2 text-xs sm:px-3" : "min-h-11 px-3 text-sm";
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex flex-wrap rounded-2xl border border-linea bg-crema/40 p-1"
    >
      {options.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.id)}
            className={`flex min-w-[calc(50%-0.125rem)] flex-1 items-center justify-center gap-1.5 rounded-xl font-semibold transition sm:min-w-0 ${pad} ${
              selected ? active : "text-carbon/60 hover:text-carbon"
            }`}
          >
            <span>{opt.label}</span>
            {opt.badge != null && opt.badge !== "" && Number(opt.badge) !== 0 && (
              <span
                className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                  selected ? "bg-crema/20 text-crema" : "bg-carbon/10 text-carbon/70"
                }`}
              >
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
