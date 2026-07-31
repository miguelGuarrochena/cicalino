import type { BillingPlan } from "@/lib/billing";

export type SubscriptionStatus =
  | "trial"
  | "active"
  | "pending_payment"
  | "expired"
  | "paused";

export const TRIAL_DAYS = 30;

export const GRACE_DAYS = 5;

const pad = (n: number) => String(n).padStart(2, "0");

export const toDateOnly = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseDateOnly = (iso: string): Date => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
};

export const addDays = (iso: string, days: number): string => {
  const d = parseDateOnly(iso);
  d.setDate(d.getDate() + days);
  return toDateOnly(d);
};

export const daysBetween = (from: string, to: string): number =>
  Math.round(
    (parseDateOnly(to).getTime() - parseDateOnly(from).getTime()) / 86_400_000,
  );

const lastDayOfMonth = (year: number, monthIndex: number): number =>
  new Date(year, monthIndex + 1, 0).getDate();

export const addCycle = (
  iso: string,
  cycleDay: number,
  plan: BillingPlan = "mensual",
): string => {
  const d = parseDateOnly(iso);
  const step = plan === "anual" ? 12 : 1;
  const year = d.getFullYear();
  const month = d.getMonth() + step;
  const target = new Date(year, month, 1);
  const day = Math.min(
    cycleDay,
    lastDayOfMonth(target.getFullYear(), target.getMonth()),
  );
  return toDateOnly(new Date(target.getFullYear(), target.getMonth(), day));
};

export const startTrial = (
  signupIso: string,
): { trialStart: string; trialEnd: string; nextBilling: string; cycleDay: number } => {
  const trialStart = signupIso.slice(0, 10);
  const trialEnd = addDays(trialStart, TRIAL_DAYS - 1);
  const nextBilling = addDays(trialEnd, 1);
  return {
    trialStart,
    trialEnd,
    nextBilling,
    cycleDay: parseDateOnly(nextBilling).getDate(),
  };
};

export interface SubscriptionState {
  status: SubscriptionStatus;
  plan: BillingPlan;
  trialEnd: string | null;
  nextBilling: string | null;
}

export const daysUntilBilling = (
  s: SubscriptionState,
  today = toDateOnly(new Date()),
): number | null => (s.nextBilling ? daysBetween(today, s.nextBilling) : null);

export const isOverdue = (
  s: SubscriptionState,
  today = toDateOnly(new Date()),
): boolean => {
  if (s.plan === "gratis" || s.status === "paused") return false;
  const left = daysUntilBilling(s, today);
  return left != null && left < 0;
};

export const isInGrace = (
  s: SubscriptionState,
  today = toDateOnly(new Date()),
): boolean => {
  if (!isOverdue(s, today)) return false;
  const late = -(daysUntilBilling(s, today) ?? 0);
  return late <= GRACE_DAYS;
};

export const registerPayment = (
  s: SubscriptionState,
  cycleDay: number,
  cycles = 1,
): {
  nextBilling: string;
  status: SubscriptionStatus;
  periodFrom: string;
  periodTo: string;
} => {
  const periodFrom = s.nextBilling ?? toDateOnly(new Date());
  const n = Math.max(1, Math.floor(cycles));
  let nextBilling = periodFrom;
  for (let i = 0; i < n; i++) {
    nextBilling = addCycle(nextBilling, cycleDay, s.plan);
  }
  return {
    nextBilling,
    status: "active",
    periodFrom,
    periodTo: addDays(nextBilling, -1),
  };
};

export const branchBillingStart = (
  nextBilling: string | null,
  createdIso = toDateOnly(new Date()),
): string => nextBilling ?? createdIso;

export const freeDaysForBranch = (
  billingStart: string,
  createdIso = toDateOnly(new Date()),
): number => Math.max(0, daysBetween(createdIso.slice(0, 10), billingStart));

export const isBranchBilling = (
  billingStart: string | null,
  today = toDateOnly(new Date()),
): boolean => !billingStart || daysBetween(today, billingStart) <= 0;
