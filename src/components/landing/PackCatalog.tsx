"use client";

import Link from "next/link";
import { useApp } from "@/components/providers/Providers";
import {
  COMBO_PACKS,
  PACK_PRICES,
  SOLO_PACKS,
  modulesForPack,
  type PackId,
} from "@/lib/pricing";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const MODULES = ["pedidos", "espera", "pagos"] as const;

/**
 * Catalogo comercial de la landing y de /pricing.
 *
 * Los montos salen de lib/pricing.ts (misma fuente que la facturacion).
 * Es informativo: contratar sigue viviendo en /pricing.
 */
export const PackCatalog = ({
  showCta = true,
}: {
  showCta?: boolean;
}) => {
  const { t } = useApp();

  const ahorroDe = (id: PackId) => {
    const m = modulesForPack(id);
    const suelto = MODULES.filter((k) => m[k]).reduce((s, k) => s + PACK_PRICES[k], 0);
    return suelto - PACK_PRICES[id];
  };

  const chips = (id: PackId) =>
    MODULES.filter((k) => modulesForPack(id)[k]).map((k) => t(`home.modulo.${k}.titulo`));

  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-carbon/50">
        {t("home.precioSueltos")}
      </p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-3">
        {SOLO_PACKS.map((id, idx) => (
          <li
            key={id}
            className="u-in flex h-full flex-col rounded-2xl border border-linea bg-surface p-5"
            style={{ animationDelay: `${0.05 + idx * 0.07}s` }}
          >
            <p
              className={`text-xs font-semibold uppercase tracking-wide ${
                id === "espera" ? "text-espera" : "text-marca"
              }`}
            >
              {t(`home.modulo.${id}.titulo`)}
            </p>
            <p
              className={`mt-1 font-display text-3xl tracking-tight ${
                id === "espera" ? "text-espera" : "text-marca"
              }`}
            >
              {money.format(PACK_PRICES[id])}
            </p>
            <p className="text-[11px] text-carbon/45">{t("home.precioPorMes")}</p>
            <p className="mt-3 flex-1 text-sm text-carbon/60">{t(`home.modulo.${id}.sub`)}</p>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-xs font-semibold uppercase tracking-wide text-carbon/50">
        {t("home.precioCombos")}
      </p>
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {COMBO_PACKS.map((id, idx) => {
          const destacado = id === "completo";
          const ahorro = ahorroDe(id);
          return (
            <li
              key={id}
              className={`u-in flex flex-col gap-3 rounded-[24px] border bg-surface p-5 ${
                destacado ? "border-marca ring-2 ring-marca/20" : "border-linea"
              }`}
              style={{ animationDelay: `${0.05 + idx * 0.06}s` }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  {destacado && (
                    <span className="mb-2 inline-block rounded-full bg-marca px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-crema">
                      {t("home.precioCompleto")}
                    </span>
                  )}
                  <p className="font-display text-xl uppercase tracking-tight text-carbon sm:text-2xl">
                    {chips(id).join(" + ")}
                  </p>
                  <p className="mt-1 text-sm text-carbon/60">{t(`home.precioCombo.${id}`)}</p>
                </div>
                <div className="shrink-0 sm:text-right">
                  <p className="font-display text-3xl tracking-tight text-marca">
                    {money.format(PACK_PRICES[id])}
                  </p>
                  <p className="text-[11px] text-carbon/45">{t("home.precioPorMes")}</p>
                  {ahorro > 0 && (
                    <p className="mt-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                      {t("home.precioAhorro", { monto: money.format(ahorro) })}
                    </p>
                  )}
                </div>
              </div>
              <p className="sr-only">{t("home.precioIncluye")}</p>
              <ul className="flex flex-wrap gap-1.5">
                {chips(id).map((label) => (
                  <li
                    key={label}
                    className="rounded-full border border-linea bg-crema/60 px-2.5 py-1 text-[11px] font-semibold text-carbon/70"
                  >
                    {label}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>

      {showCta && (
        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="text-xs font-medium text-carbon/50">{t("home.precioAnual")}</p>
          <Link
            href="/pricing"
            className="flex min-h-12 items-center justify-center rounded-full border-2 border-marca px-7 text-sm font-semibold text-marca transition hover:bg-marca hover:text-crema active:scale-95"
          >
            {t("home.precioVerTodo")}
          </Link>
        </div>
      )}
    </>
  );
};
