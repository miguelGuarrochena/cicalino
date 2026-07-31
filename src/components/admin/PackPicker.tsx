"use client";

import {
  PRICE_ORDERS,
  PRICE_WAITLIST,
  PRICE_BUNDLE,
} from "@/lib/pricing";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export const PackPicker = ({
  pedidos,
  espera,
  onChange,
  compact,
}: {
  pedidos: boolean;
  espera: boolean;
  onChange: (p: boolean, e: boolean) => void;
  compact?: boolean;
}) => (
  <div
    role="group"
    className={`grid grid-cols-3 gap-1 rounded-xl border border-linea bg-crema/50 p-1 ${
      compact ? "" : "mt-1.5"
    }`}
  >
    {(
      [
        [true, false, "Pedidos", PRICE_ORDERS],
        [false, true, "Espera", PRICE_WAITLIST],
        [true, true, "Pack", PRICE_BUNDLE],
      ] as const
    ).map(([p, e, label, precio]) => {
      const activo = pedidos === p && espera === e;
      const acento = e
        ? "text-espera ring-espera/40"
        : "text-marca ring-marca/40";
      return (
        <button
          key={label}
          type="button"
          aria-pressed={activo}
          onClick={() => onChange(p, e)}
          className={`flex flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 py-1.5 leading-tight transition ${
            activo
              ? `bg-surface shadow-sm ring-1 ring-inset ${acento}`
              : "text-carbon/55 hover:bg-surface/70"
          }`}
        >
          <span className="text-[11px] font-semibold">{label}</span>
          <span className="text-[10px] font-medium tabular-nums opacity-70">
            {money.format(precio)}
          </span>
        </button>
      );
    })}
  </div>
);
