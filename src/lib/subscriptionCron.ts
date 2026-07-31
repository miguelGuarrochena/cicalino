import {
  GRACE_DAYS,
  daysBetween,
  type SubscriptionStatus,
} from "@/lib/subscription";
import type { BillingPlan } from "@/lib/billing";

export type CronEmail = "trial_5d" | "trial_end" | "overdue";

export interface CronOrg {
  id: string;
  plan: BillingPlan;
  status: SubscriptionStatus;
  trialEnd: string | null;
  nextBilling: string | null;
  aviso5dEn: string | null;
  avisoFinEn: string | null;
  avisoCobroEn: string | null;
}

export interface CronAction {
  emails: CronEmail[];
  newStatus: SubscriptionStatus | null;
}

const NOTHING: CronAction = { emails: [], newStatus: null };

const AVISO_5D = 5;

export const planDailyActions = (
  org: CronOrg,
  today: string,
): CronAction => {
  if (org.plan === "gratis" || org.status === "paused") return NOTHING;
  if (org.status === "expired") return NOTHING;

  const emails: CronEmail[] = [];
  let newStatus: SubscriptionStatus | null = null;

  if (org.status === "trial") {
    if (org.trialEnd) {
      const faltan = daysBetween(today, org.trialEnd);

      if (faltan <= AVISO_5D && faltan >= 0 && !org.aviso5dEn) {
        emails.push("trial_5d");
      }

      if (faltan < 0) {
        if (!org.avisoFinEn) emails.push("trial_end");
        newStatus = "pending_payment";
      }
    }
    return { emails, newStatus };
  }

  if (!org.nextBilling) return NOTHING;
  const atraso = -daysBetween(today, org.nextBilling);
  if (atraso <= 0) return NOTHING;

  if (org.status === "active") newStatus = "pending_payment";

  if (atraso > GRACE_DAYS) {
    newStatus = "expired";
  } else if (!org.avisoCobroEn || org.avisoCobroEn.slice(0, 10) < org.nextBilling) {
    emails.push("overdue");
  }

  return { emails, newStatus };
};
