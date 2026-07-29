import { PRECIO_POR_SUCURSAL } from "@/lib/precios";

/** Versión publicada de los términos (subí la fecha al cambiar el texto legal). */
export const TERMINOS_VERSION = "2026-07-29b";

export type PlanCobroUI = "mensual" | "anual" | "gratis";

/** Alias de Mercado Pago para transferencias (env o fallback). */
export const mpAlias = (): string =>
  (process.env.NEXT_PUBLIC_MP_ALIAS ?? process.env.MP_ALIAS ?? "miguel.gua.mp").trim();

export const montoContrato = (plan: PlanCobroUI, cupo: number): number => {
  if (plan === "gratis") return 0;
  const mes = Math.max(1, cupo) * PRECIO_POR_SUCURSAL;
  return plan === "anual" ? mes * 10 : mes;
};

export const etiquetaCiclo = (plan: PlanCobroUI): string => {
  if (plan === "anual") return "anual (10 meses)";
  if (plan === "gratis") return "cortesía";
  return "mensual";
};
