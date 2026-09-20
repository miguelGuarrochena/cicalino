"use client";

import Link from "next/link";
import { useApp } from "@/components/providers/Providers";

export type AyudaSeccion =
  | "pedidos"
  | "espera"
  | "pagos"
  | "config"
  | "metricas"
  | "general";

export const HelpLink = ({
  seccion,
  className = "",
  accent = "marca",
}: {
  seccion: AyudaSeccion;
  className?: string;
  accent?: "marca" | "espera" | "pagos";
}) => {
  const { t } = useApp();
  const hover =
    accent === "espera"
      ? "hover:border-espera/40 hover:bg-espera/5 hover:text-espera"
      : accent === "pagos"
        ? "hover:border-pagos/40 hover:bg-pagos/5 hover:text-pagos"
        : "hover:border-marca/40 hover:bg-marca/5 hover:text-marca";
  return (
    <Link
      href={`/panel/ayuda#${seccion}`}
      aria-label={t("ayuda.verAyuda")}
      title={t("ayuda.verAyuda")}
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-linea text-xs font-bold text-carbon/45 transition ${hover} ${className}`}
    >
      ?
    </Link>
  );
};
