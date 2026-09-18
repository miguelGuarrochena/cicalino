"use client";

import type { ReactNode } from "react";

type Accent = "marca" | "espera";

export type SegmentedTab<T extends string> = {
  id: T;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
  pulse?: boolean;
  priority?: boolean;
  tone?: "marca" | "curso";
};

export const SegmentedTabs = <T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  accent = "marca",
}: {
  value: T;
  onChange: (id: T) => void;
  options: SegmentedTab<T>[];
  ariaLabel: string;
  accent?: Accent;
}) => {
  const active =
    accent === "espera"
      ? "border-espera bg-espera text-crema"
      : "border-marca bg-marca text-crema";
  const n = options.length;
  const cols =
    n <= 2
      ? "grid-cols-2"
      : n === 3
        ? "grid-cols-3"
        : n === 4
          ? "grid-cols-2 sm:grid-cols-4"
          : "grid-cols-3 sm:grid-cols-5";
  return (
    <div role="tablist" aria-label={ariaLabel} className={`grid gap-2 ${cols}`}>
      {options.map((opt) => {
        const selected = value === opt.id;
        const showBadge =
          opt.badge != null && opt.badge !== "" && Number(opt.badge) !== 0;
        const pulse = Boolean(opt.pulse);
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.id)}
            className={`relative flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 py-2 text-xs font-semibold transition active:scale-[0.98] sm:min-h-[5rem] sm:text-sm ${
              selected
                ? active
                : pulse && opt.priority
                  ? "border-curso-borde bg-curso-fondo text-carbon hover:border-curso"
                  : pulse
                    ? "border-marca/35 bg-marca/10 text-carbon hover:border-marca/45"
                    : "border-linea bg-surface text-carbon/60 hover:border-carbon/25 hover:text-carbon"
            } ${
              pulse && !selected
                ? opt.priority
                  ? "u-attention-pulse-priority"
                  : "u-attention-pulse"
                : ""
            }`}
          >
            {opt.icon ? (
              <span className="flex size-8 items-center justify-center sm:size-9">
                {opt.icon}
              </span>
            ) : null}
            <span className="leading-tight">{opt.label}</span>
            {showBadge ? (
              <span
                className={`absolute right-2 top-2 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                  selected
                    ? "bg-crema/20 text-crema"
                    : pulse && opt.priority
                      ? "bg-curso text-crema"
                      : pulse
                        ? "bg-marca text-crema"
                        : opt.tone === "curso"
                          ? "bg-curso-fondo text-curso"
                          : opt.tone === "marca"
                            ? "bg-marca/15 text-marca"
                            : "bg-carbon/10 text-carbon/70"
                }`}
              >
                {opt.badge}
              </span>
            ) : pulse && !selected ? (
              <span
                aria-hidden
                className={`absolute right-2 top-2 size-2 rounded-full ${
                  opt.priority ? "bg-curso u-attention-dot" : "bg-marca u-attention-dot"
                }`}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
};
