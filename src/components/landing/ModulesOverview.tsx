"use client";

import { useApp } from "@/components/providers/Providers";
import { ThemedImg } from "@/components/ui/ThemedImg";
import {
  PRICE_ORDERS,
  PRICE_SPLIT,
  PRICE_WAITLIST,
} from "@/lib/pricing";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

/* "One platform, three solutions". Prices come from lib/pricing, same source
 * as /pricing and billing, so the cards can't drift from what gets charged. */
export const ModulesOverview = () => {
  const { t } = useApp();

  const modules = [
    {
      id: "pedidos",
      img: "bell" as const,
      price: PRICE_ORDERS,
      accent: "text-marca",
      ring: "hover:border-marca/40",
    },
    {
      id: "espera",
      img: "espera" as const,
      price: PRICE_WAITLIST,
      accent: "text-espera",
      ring: "hover:border-espera/40",
    },
    {
      id: "pagos",
      img: "ok" as const,
      price: PRICE_SPLIT,
      accent: "text-marca",
      ring: "hover:border-marca/40",
      nuevo: true,
    },
  ];

  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-12 sm:px-8 sm:py-16">
      <div className="text-center">
        <h2 className="u-in font-display text-3xl uppercase tracking-tight text-marca sm:text-4xl">
          {t("home.modulosTitulo")}
        </h2>
        <p className="u-in mx-auto mt-3 max-w-xl text-carbon/65 sm:text-lg">
          {t("home.modulosSub")}
        </p>
      </div>

      <ul className="mt-10 grid gap-3 sm:grid-cols-3">
        {modules.map((m, idx) => (
          <li
            key={m.id}
            className={`u-in relative flex flex-col rounded-[24px] border border-linea bg-surface p-5 shadow-sm transition ${m.ring}`}
            style={{ animationDelay: `${0.05 + idx * 0.07}s` }}
          >
            {m.nuevo && (
              <span className="absolute right-4 top-4 rounded-full bg-marca px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-crema">
                {t("home.nuevo")}
              </span>
            )}
            <ThemedImg name={m.img} alt="" className="h-16 w-auto self-start" />
            <h3 className={`mt-4 font-display text-2xl uppercase tracking-tight ${m.accent}`}>
              {t(`home.modulo.${m.id}.titulo`)}
            </h3>
            <p className="mt-2 flex-1 text-sm text-carbon/65">
              {t(`home.modulo.${m.id}.sub`)}
            </p>
            <p className="mt-4 text-xs text-carbon/50">
              {t("home.desde", { monto: money.format(m.price) })}
            </p>
            {m.id === "pagos" && (
              <a
                href="#pagos-divididos"
                className="mt-3 text-sm font-semibold text-marca underline-offset-4 hover:underline"
              >
                {t("home.pagos.verComo")} →
              </a>
            )}
          </li>
        ))}
      </ul>
      <p className="u-in mt-5 text-center text-sm text-carbon/55">
        {t("home.modulosCombinar")}
      </p>
    </section>
  );
};
