import {
  PRECIO_PEDIDOS,
  precioMensualPorSucursal,
  precioMensualSucursales,
  type ModulosFlags,
} from "@/lib/precios";

/** Versión publicada de los términos (subí la fecha al cambiar el texto legal). */
export const TERMINOS_VERSION = "2026-07-29e";

export type PlanCobroUI = "mensual" | "anual" | "gratis";

/** Alias de Mercado Pago para transferencias (env o fallback). */
export const mpAlias = (): string =>
  (process.env.NEXT_PUBLIC_MP_ALIAS ?? process.env.MP_ALIAS ?? "miguel.gua.mp").trim();

/**
 * Monto de una línea uniforme (ej. pedir 1 sucursal extra con un pack).
 * Preferí `montoContratoSucursales` cuando hay packs distintos por local.
 */
export const montoContrato = (
  plan: PlanCobroUI,
  cupo: number,
  modulos: ModulosFlags = { pedidos: true, espera: false },
): number => {
  if (plan === "gratis") return 0;
  const mes = Math.max(1, cupo) * precioMensualPorSucursal(modulos);
  return plan === "anual" ? mes * 10 : mes;
};

/** Cobro total = suma de módulos de cada sucursal (anual = ×10). */
export const montoContratoSucursales = (
  plan: PlanCobroUI,
  sucursales: ModulosFlags[],
): number => {
  if (plan === "gratis") return 0;
  const mes = precioMensualSucursales(sucursales);
  return plan === "anual" ? mes * 10 : mes;
};

/** Compat: precio solo pedidos. */
export const PRECIO_LISTA_PEDIDOS = PRECIO_PEDIDOS;


export const etiquetaCiclo = (plan: PlanCobroUI): string => {
  if (plan === "anual") return "anual (10 meses)";
  if (plan === "gratis") return "cortesía";
  return "mensual";
};
