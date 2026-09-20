"use client";

import Link from "next/link";
import { useApp } from "@/components/providers/Providers";
import { Controls } from "@/components/ui/Controls";

export const SiteFooter = ({
  className = "",
  /* El tema y el idioma, para las pantallas que no los tienen en otro lado.
   *
   * Abajo de `sm` muchas cabeceras públicas los esconden y este footer es el
   * único lugar donde cambiarlos. Pero el panel y el admin los tienen siempre
   * a mano —el sol en la barra y el idioma en el menú ···—, así que ahí
   * repetirlos es ruido al pie de todas las pantallas. */
  showControls = true,
}: {
  className?: string;
  showControls?: boolean;
}) => {
  const { t } = useApp();
  const year = new Date().getFullYear();

  return (
    <footer className={`w-full border-t border-linea/70 bg-crema ${className}`}>
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 items-center justify-items-center gap-4 px-5 py-6 text-center text-xs text-carbon/50 sm:grid-cols-3 sm:justify-items-stretch sm:gap-6 sm:px-8 sm:py-7 sm:text-left">
        <p className="text-carbon/40 sm:justify-self-start">
          © {year} Cicalino
        </p>

        <p className="sm:justify-self-center sm:text-center">
          {t("footer.creado")}{" "}
          <a
            href="https://miguelguarrochena.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-marca underline-offset-2 hover:underline"
          >
            miguelguarrochena.dev
          </a>
        </p>

        {showControls && <Controls className="justify-center sm:hidden" />}

        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 font-medium text-carbon/55 sm:justify-self-end">
          <Link
            href="/pricing"
            className="underline-offset-2 transition hover:text-carbon hover:underline"
          >
            {t("nav.precios")}
          </Link>
          <Link
            href="/faq"
            className="underline-offset-2 transition hover:text-carbon hover:underline"
          >
            {t("nav.faq")}
          </Link>
          <Link
            href="/privacy"
            className="underline-offset-2 transition hover:text-carbon hover:underline"
          >
            {t("nav.privacidad")}
          </Link>
          <Link
            href="/terms"
            className="underline-offset-2 transition hover:text-carbon hover:underline"
          >
            {t("nav.terminos")}
          </Link>
        </nav>
      </div>
    </footer>
  );
};
