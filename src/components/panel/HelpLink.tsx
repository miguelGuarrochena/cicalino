"use client";

import Link from "next/link";
import { useApp } from "@/components/providers/Providers";

export type AyudaSeccion =
  | "pedidos"
  | "espera"
  | "config"
  | "metricas"
  | "general";

/** Acceso discreto a la guía de la sección. No bloquea la operativa. */
export const HelpLink = ({
  seccion,
  className = "",
}: {
  seccion: AyudaSeccion;
  className?: string;
}) => {
  const { t } = useApp();
  return (
    <Link
      href={`/panel/ayuda#${seccion}`}
      aria-label={t("ayuda.verAyuda")}
      title={t("ayuda.verAyuda")}
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-linea text-xs font-bold text-carbon/40 transition hover:border-marca/40 hover:bg-marca/5 hover:text-marca ${className}`}
    >
      ?
    </Link>
  );
};
