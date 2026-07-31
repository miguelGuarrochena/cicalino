"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Controls } from "@/components/ui/Controls";
import { useApp } from "@/components/providers/Providers";

/**
 * Header de la landing.
 *
 * Jerarquia: un solo boton solido ("Probar gratis"). "Entrar" queda como link
 * de texto porque es una accion de utilidad para quien ya es cliente, no el
 * objetivo de la pagina.
 *
 * Arranca transparente sobre el hero y toma fondo + borde al scrollear, asi el
 * CTA sigue disponible en una pagina larga sin tapar el hero al entrar.
 */
export const LandingHeader = ({
  onFaqClick,
}: {
  onFaqClick?: () => void;
}) => {
  const { t } = useApp();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLink =
    "rounded-full px-3 py-2 text-sm font-semibold text-carbon/65 transition hover:bg-marca/8 hover:text-marca";

  return (
    <header
      className={`sticky top-0 z-30 transition-colors duration-300 ${
        scrolled
          ? "border-b border-linea/70 bg-crema/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 sm:py-4">
        {/* El hero ya muestra el logo grande: en el tope lo ocultamos para no
            duplicar la marca, y aparece al scrollear como ancla a home. */}
        <div
          className={`transition-all duration-300 ${
            scrolled
              ? "translate-y-0 opacity-100"
              : "pointer-events-none -translate-y-1 opacity-0"
          }`}
          aria-hidden={!scrolled}
        >
          <Logo className="h-8 sm:h-9" />
        </div>

        <nav className="ml-4 hidden items-center gap-1 sm:flex">
          <Link href="/pricing" className={navLink}>
            {t("nav.precios")}
          </Link>
          <a
            href="/#faq"
            onClick={(e) => {
              if (!onFaqClick) return;
              e.preventDefault();
              onFaqClick();
            }}
            className={navLink}
          >
            {t("nav.faq")}
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-3">
          <Controls className="hidden md:flex" />

          <Link
            href="/login"
            className="flex min-h-11 items-center justify-center rounded-full px-3 text-sm font-semibold text-carbon/65 underline-offset-4 transition hover:text-marca hover:underline sm:px-4"
          >
            {t("nav.entrar")}
          </Link>

          <Link
            href="/probar"
            className="flex min-h-11 items-center justify-center rounded-full bg-marca px-4 text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95 sm:px-5"
          >
            {t("nav.probar")}
          </Link>
        </div>
      </div>
    </header>
  );
};
