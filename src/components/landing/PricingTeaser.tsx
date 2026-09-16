"use client";

import Link from "next/link";
import { useApp } from "@/components/providers/Providers";
import {
  PACK_PRICES,
  PRICE_ORDERS,
  PRICE_SPLIT,
  PRICE_WAITLIST,
  modulesForPack,
  type PackId,
} from "@/lib/pricing";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const SOLO: Record<"pedidos" | "espera" | "pagos", number> = {
  pedidos: PRICE_ORDERS,
  espera: PRICE_WAITLIST,
  pagos: PRICE_SPLIT,
};

const COMBOS: PackId[] = ["pack", "espera_pagos", "pedidos_pagos", "completo"];

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
  const ahorroDe = (id: PackId) => {
    const m = modulesForPack(id);
    const suelto = (Object.keys(SOLO) as (keyof typeof SOLO)[])
      .filter((k) => m[k])
      .reduce((s, k) => s + SOLO[k], 0);
    return suelto - PACK_PRICES[id];
  };

  const comboLabel = (id: PackId) => {
    const m = modulesForPack(id);
    return (["pedidos", "espera", "pagos"] as const)
      .filter((k) => m[k])
      .map((k) => t(`home.modulo.${k}.titulo`))
      .join(" + ");
  };

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

        <p className="mt-10 text-xs font-semibold uppercase tracking-wide text-carbon/50">
          {t("home.precioSueltos")}
        </p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-3">
          {(Object.keys(SOLO) as (keyof typeof SOLO)[]).map((k, idx) => (
            <li
              key={k}
              className="u-in flex h-full flex-col rounded-2xl border border-linea bg-surface p-5"
              style={{ animationDelay: `${0.05 + idx * 0.07}s` }}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-carbon/50">
                {t(`home.modulo.${k}.titulo`)}
              </p>
              <p
                className={`mt-1 font-display text-3xl tracking-tight ${
                  k === "espera" ? "text-espera" : "text-marca"
                }`}
              >
                {money.format(SOLO[k])}
              </p>
              <p className="text-[11px] text-carbon/45">{t("home.precioPorMes")}</p>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-xs font-semibold uppercase tracking-wide text-carbon/50">
          {t("home.precioCombos")}
        </p>
        {/* The full pack stands out by its border and badge. */}
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {COMBOS.map((id, idx) => {
            const destacado = id === "completo";
            const ahorro = ahorroDe(id);
            return (
              <li
                key={id}
                className={`u-in flex items-center justify-between gap-4 rounded-2xl border bg-surface p-4 ${
                  destacado ? "border-marca ring-2 ring-marca/20" : "border-linea"
                }`}
                style={{ animationDelay: `${0.05 + idx * 0.06}s` }}
              >
                <div className="min-w-0">
                  {destacado && (
                    <span className="mb-1 inline-block rounded-full bg-marca px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-crema">
                      {t("home.precioCompleto")}
                    </span>
                  )}
                  <p className="text-sm font-semibold text-carbon">{comboLabel(id)}</p>
                  {ahorro > 0 && (
                    <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                      {t("home.precioAhorro", { monto: money.format(ahorro) })}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-2xl tracking-tight text-marca">
                    {money.format(PACK_PRICES[id])}
                  </p>
                  <p className="text-[11px] text-carbon/45">{t("home.precioPorMes")}</p>
                </div>
              </li>
            );
          })}
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
