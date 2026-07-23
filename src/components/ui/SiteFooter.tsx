"use client";

import Link from "next/link";
import { useApp } from "@/components/providers/Providers";

// Footer a todo el ancho:
// © Cicalino | Creado por … | Privacidad · Términos
// (FAQ solo dentro de la app / panel)
export const SiteFooter = ({ className = "" }: { className?: string }) => {
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

        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-medium text-carbon/55 sm:justify-self-end">
          <Link
            href="/privacidad"
            className="underline-offset-2 transition hover:text-carbon hover:underline"
          >
            {t("nav.privacidad")}
          </Link>
          <Link
            href="/terminos"
            className="underline-offset-2 transition hover:text-carbon hover:underline"
          >
            {t("nav.terminos")}
          </Link>
        </nav>
      </div>
    </footer>
  );
};
