
export type BillingPlan = "mensual" | "anual" | "gratis";

export const addBillingCycle = (
  plan: BillingPlan,
  desde: Date = new Date(),
): Date | null => {
  if (plan === "gratis") return null;
  const d = new Date(desde.getTime());
  if (plan === "anual") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
};

export const daysUntil = (iso: string): number => {
  const fin = new Date(iso);
  fin.setHours(23, 59, 59, 999);
  return Math.ceil((fin.getTime() - Date.now()) / 86_400_000);
};

export type OrgBilling = {
  activo: boolean;
  pagado: boolean;
  plan: BillingPlan;
  mesGratisHasta: string | null;
  proximoCobroEn: string | null;
};

export const isOrgBillingDue = (org: OrgBilling): boolean => {
  if (!org.activo || org.plan === "gratis") return false;
  if (!org.pagado) return true;
  if (org.mesGratisHasta && daysUntil(org.mesGratisHasta) <= 3) return true;
  if (org.proximoCobroEn && daysUntil(org.proximoCobroEn) <= 3) return true;
  return false;
};

export const billingReason = (org: OrgBilling): string => {
  if (!org.pagado) return "Marcado como impago";
  if (org.mesGratisHasta && daysUntil(org.mesGratisHasta) <= 3) {
    const d = daysUntil(org.mesGratisHasta);
    if (d < 0) return "Terminó el mes gratis";
    if (d === 0) return "El mes gratis termina hoy";
    return `El mes gratis termina en ${d} día${d === 1 ? "" : "s"}`;
  }
  if (org.proximoCobroEn) {
    const d = daysUntil(org.proximoCobroEn);
    if (d < 0) return "Venció el cobro";
    if (d === 0) return "Cobro vence hoy";
    return `Cobro en ${d} día${d === 1 ? "" : "s"}`;
  }
  return "Revisar cobro";
};
