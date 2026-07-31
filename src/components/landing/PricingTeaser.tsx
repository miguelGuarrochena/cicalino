"use client";

import Link from "next/link";
import { useApp } from "@/components/providers/Providers";
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

/**
 * Bloque de precios de la landing.
 *
 * Los montos salen de lib/pricing.ts (misma fuente que /pricing y la
 * facturacion) para que no se desincronicen. Es informativo: la contratacion
 * sigue viviendo en /pricing.
 */
export const PricingTeaser = () => {
  const { t } = useApp();

  // Calculado, no hardcodeado: si cambian los precios el ahorro se ajusta solo.
  const ahorro = PRICE_ORDERS + PRICE_WAITLIST - PRICE_BUNDLE;

  const packs = [
    {
      id: "pedidos",
      label: t("home.precioPedidos"),
      price: PRICE_ORDERS,
      priceColor: "text-marca",
      border: "border-linea",
      destacado: false,
    },
    {
      id: "espera",
      label: t("home.precioEspera"),
      price: PRICE_WAITLIST,
      priceColor: "text-espera",
      border: "border-linea",
      destacado: false,
    },
    {
      id: "pack",
      label: t("home.precioPack"),
      price: PRICE_BUNDLE,
      priceColor: "text-marca",
      border: "border-marca ring-2 ring-marca/20",
      destacado: true,
    },
  ];

  return (
    <section
      id="precios"
      className="scroll-mt-24 border-t border-linea/80 px-6 py-16 sm:px-8 sm:py-20"
    >
      <div className="mx-auto w-full max-w-4xl">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-marca">
            {t("home.precioKicker")}
          </p>
          <h2 className="mt-2 font-display text-3xl uppercase tracking-tight text-carbon sm:text-4xl">
            {t("home.precioTitulo")}
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-carbon/60">
            {t("home.precioSub")}
          </p>
        </div>

        <ul className="mt-10 grid gap-3 sm:grid-cols-3 sm:items-end">
          {packs.map((p, idx) => (
            <li
              key={p.id}
              className={`u-in relative rounded-2xl border bg-surface p-5 ${p.border} ${
                p.destacado ? "sm:pb-7 sm:pt-8" : ""
              }`}
              style={{ animationDelay: `${0.05 + idx * 0.07}s` }}
            >
              {p.destacado && (
                <span className="absolute -top-2.5 left-5 rounded-full bg-marca px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-crema">
                  {t("home.precioPopular")}
                </span>
              )}

              <p className="text-xs font-semibold uppercase tracking-wide text-carbon/50">
                {p.label}
              </p>
              <p
                className={`mt-1 font-display text-3xl tracking-tight ${p.priceColor}`}
              >
                {money.format(p.price)}
              </p>
              <p className="text-[11px] text-carbon/45">
                {t("home.precioPorMes")}
              </p>

              {p.destacado && ahorro > 0 && (
                <p className="mt-2 text-[11px] font-semibold text-emerald-700">
                  {t("home.precioAhorro", { monto: money.format(ahorro) })}
                </p>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="text-xs font-medium text-carbon/50">
            {t("home.precioAnual")}
          </p>
          <Link
            href="/pricing"
            className="flex min-h-12 items-center justify-center rounded-full border-2 border-marca px-7 text-sm font-semibold text-marca transition hover:bg-marca hover:text-crema active:scale-95"
          >
            {t("home.precioVerTodo")}
          </Link>
        </div>
      </div>
    </section>
  );
};
