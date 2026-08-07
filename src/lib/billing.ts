import type { SubscriptionStatus } from "@/lib/subscription";

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

/* How many days ahead an upcoming invoice starts showing up in the Cobros
 * panel. Enough notice to reach the shop before the date, not so much that the
 * list is permanently full. */
const AVISO_PREVIO_DIAS = 3;

/* What the Cobros panel needs to decide whether an account wants attention.
 *
 * This used to read `pagado` and `proximo_cobro_en`, while the cron and the
 * cut-off read `estado_suscripcion` and `proxima_factura`. Two sources of
 * truth for the same question, and they diverged from the moment an account
 * was created: signup wrote `proximo_cobro_en` as the end of the courtesy
 * month and `proxima_factura` as the end of the 30-day trial.
 *
 * Now everything reads the subscription state. `mes_gratis_hasta` stays,
 * because a courtesy month granted to an existing customer is a real thing
 * that the trial doesn't cover. */
export type OrgBilling = {
  activo: boolean;
  plan: BillingPlan;
  status: SubscriptionStatus;
  freeMonthUntil: string | null;
  nextInvoice: string | null;
};

const enCortesia = (org: OrgBilling): boolean =>
  Boolean(org.freeMonthUntil && daysUntil(org.freeMonthUntil) <= AVISO_PREVIO_DIAS);

export const isOrgBillingDue = (org: OrgBilling): boolean => {
  if (!org.activo || org.plan === "gratis") return false;
  /* Owing money or already cut off: the two states someone has to act on. */
  if (org.status === "pending_payment" || org.status === "expired") return true;
  if (enCortesia(org)) return true;
  if (org.nextInvoice && daysUntil(org.nextInvoice) <= AVISO_PREVIO_DIAS) {
    return true;
  }
  return false;
};

const enDias = (d: number, vencido: string, hoy: string, futuro: string): string => {
  if (d < 0) return vencido;
  if (d === 0) return hoy;
  return `${futuro} ${d} día${d === 1 ? "" : "s"}`;
};

export const billingReason = (org: OrgBilling): string => {
  if (org.status === "expired") return "Dada de baja por falta de pago";
  if (org.status === "pending_payment") {
    if (org.nextInvoice) {
      const d = daysUntil(org.nextInvoice);
      if (d < 0) return `Pago pendiente · vencía hace ${Math.abs(d)} día${d === -1 ? "" : "s"}`;
    }
    return "Pago pendiente";
  }
  if (enCortesia(org) && org.freeMonthUntil) {
    return enDias(
      daysUntil(org.freeMonthUntil),
      "Terminó el mes gratis",
      "El mes gratis termina hoy",
      "El mes gratis termina en",
    );
  }
  if (org.status === "trial") return "En prueba";
  if (org.nextInvoice) {
    return enDias(
      daysUntil(org.nextInvoice),
      "Venció el cobro",
      "Cobro vence hoy",
      "Cobro en",
    );
  }
  return "Revisar cobro";
};
