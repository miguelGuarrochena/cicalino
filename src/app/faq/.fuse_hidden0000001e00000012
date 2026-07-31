"use client";

import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Controls } from "@/components/ui/Controls";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { FaqContent } from "@/components/faq/FaqContent";
import { useApp } from "@/components/providers/Providers";

const FaqPage = () => {
  const { t } = useApp();

  return (
    <div className="flex min-h-dvh flex-col bg-crema">
      <header className="sticky top-0 z-20 border-b border-linea/70 bg-crema/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-3 sm:px-6">
          <Logo className="h-10 sm:h-12" />
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/pricing"
              className="rounded-full border border-marca/25 bg-crema/70 px-4 py-2 text-xs font-semibold text-marca transition hover:bg-marca hover:text-crema sm:text-sm"
            >
              {t("nav.precios")}
            </Link>
            <Link
              href="/login"
              className="rounded-full bg-marca px-4 py-2 text-xs font-semibold text-crema transition hover:bg-marca-fuerte sm:text-sm"
            >
              {t("nav.entrar")}
            </Link>
            <Controls />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8 sm:px-6 sm:py-12">
        <h1 className="font-display text-4xl uppercase tracking-tight text-carbon sm:text-5xl">
          {t("faq.titulo")}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-carbon/55 sm:text-base">
          {t("faq.sub")}
        </p>

        <FaqContent className="mt-10" />
      </main>

      <SiteFooter />
    </div>
  );
};
export default FaqPage;
