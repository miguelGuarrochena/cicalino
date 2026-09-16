"use client";

import {
  monthlyPriceForBranch,
  normalizeModules,
  type ModuleFlags,
} from "@/lib/pricing";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const MODULES: { key: keyof ModuleFlags; label: string; accent: string }[] = [
  { key: "pedidos", label: "Pedidos", accent: "text-marca ring-marca/40" },
  { key: "espera", label: "Recepción", accent: "text-espera ring-espera/40" },
  { key: "pagos", label: "Pagos divididos", accent: "text-marca ring-marca/40" },
];

/* Three independent modules; each combination has its own price in
 * lib/pricing. Turning the last one off is ignored: a branch always keeps at
 * least one module. */
export const PackPicker = ({
  value,
  onChange,
  compact,
}: {
  value: ModuleFlags;
  onChange: (m: ModuleFlags) => void;
  compact?: boolean;
}) => {
  const toggle = (key: keyof ModuleFlags) => {
    const next = { ...value, [key]: !value[key] };
    if (!next.pedidos && !next.espera && !next.pagos) return;
    onChange(normalizeModules(next));
  };

  return (
    <div className={compact ? "" : "mt-1.5"}>
      <div
        role="group"
        aria-label="Módulos contratados"
        className="grid grid-cols-3 gap-1 rounded-xl border border-linea bg-crema/50 p-1"
      >
        {MODULES.map((m) => {
          const activo = value[m.key];
          return (
            <button
              key={m.key}
              type="button"
              aria-pressed={activo}
              onClick={() => toggle(m.key)}
              className={`flex min-h-9 items-center justify-center rounded-lg px-1.5 py-1.5 text-[11px] font-semibold leading-tight transition ${
                activo
                  ? `bg-surface shadow-sm ring-1 ring-inset ${m.accent}`
                  : "text-carbon/55 hover:bg-surface/70"
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-right text-[11px] font-medium tabular-nums text-carbon/55">
        {money.format(monthlyPriceForBranch(value))} / mes
      </p>
    </div>
  );
};
