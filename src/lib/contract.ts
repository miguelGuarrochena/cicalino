import {
  PRICE_ORDERS,
  monthlyPriceForBranch,
  monthlyPriceForBranches,
  type ModuleFlags,
} from "@/lib/pricing";

export const TERMS_VERSION = "2026-07-29e";

/* Links /aceptar/[token]: 7 días desde la emisión. Al reenviar se renueva. */
export const CONTRACT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const contractTokenExpired = (creadoEn: string | null | undefined): boolean => {
  if (!creadoEn) return true;
  const t = new Date(creadoEn).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t > CONTRACT_TOKEN_TTL_MS;
};

export type BillingPlanUI = "mensual" | "anual" | "gratis";

export const mpAlias = (): string =>
  (process.env.NEXT_PUBLIC_MP_ALIAS ?? process.env.MP_ALIAS ?? "miguel.gua.mp").trim();

export const contractAmount = (
  plan: BillingPlanUI,
  cupo: number,
  modulos: ModuleFlags = { pedidos: true, espera: false },
): number => {
  if (plan === "gratis") return 0;
  const mes = Math.max(1, cupo) * monthlyPriceForBranch(modulos);
  return plan === "anual" ? mes * 10 : mes;
};

export const contractAmountForBranches = (
  plan: BillingPlanUI,
  sucursales: ModuleFlags[],
): number => {
  if (plan === "gratis") return 0;
  const mes = monthlyPriceForBranches(sucursales);
  return plan === "anual" ? mes * 10 : mes;
};

export const PRICE_LIST_ORDERS = PRICE_ORDERS;

export const billingCycleLabel = (plan: BillingPlanUI): string => {
  if (plan === "anual") return "anual (10 meses)";
  if (plan === "gratis") return "cortesía";
  return "mensual";
};
