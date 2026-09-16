"use client";

import { useApp } from "@/components/providers/Providers";
import { PackCatalog } from "@/components/landing/PackCatalog";

export const PricingTeaser = () => {
  const { t } = useApp();

  return (
    <section
      id="precios"
      className="scroll-mt-24 border-t border-linea/80 px-6 py-16 sm:px-8 sm:py-20"
    >
      <div className="mx-auto w-full max-w-5xl">
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

        <div className="mt-10">
          <PackCatalog />
        </div>
      </div>
    </section>
  );
};
