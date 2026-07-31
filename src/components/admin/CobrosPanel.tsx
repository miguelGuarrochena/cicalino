"use client";

import { useEffect, useMemo } from "react";
import { checkBillingOnAdminOpen } from "@/lib/actions/billing";
import { billingReason, isOrgBillingDue } from "@/lib/billing";
import { useSuperadminStore } from "@/lib/store/superadmin-store";

export const CobrosPanel = ({
  onAbrir,
}: {
  onAbrir?: (orgId: string) => void;
}) => {
  const organizations = useSuperadminStore((s) => s.organizaciones);

  const items = useMemo(
    () =>
      organizations
        .filter((o) =>
          isOrgBillingDue({
            activo: o.activo,
            pagado: o.pagado,
            plan: o.plan,
            freeMonthUntil: o.freeMonthUntil,
            nextChargeAt: o.nextChargeAt,
          }),
        )
        .map((o) => ({
          id: o.id,
          name: o.name,
          motivo: billingReason({
            activo: o.activo,
            pagado: o.pagado,
            plan: o.plan,
            freeMonthUntil: o.freeMonthUntil,
            nextChargeAt: o.nextChargeAt,
          }),
          email: o.ownerEmail,
        })),
    [organizations],
  );

  useEffect(() => {
    void checkBillingOnAdminOpen();
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="rounded-[24px] border border-amber-300/80 bg-amber-100 p-4 shadow-sm sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-amber-950">
        Cobros a revisar
        <span className="rounded-full bg-amber-700 px-2 py-0.5 text-xs text-white">
          {items.length}
        </span>
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((o) => (
          <li
            key={o.id}
            className="flex flex-col gap-2 rounded-2xl border border-amber-200/80 bg-surface px-3 py-3 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-carbon">{o.name}</p>
              <p className="truncate text-xs text-carbon/55">
                {o.motivo} · {o.email}
              </p>
            </div>
            {onAbrir && (
              <button
                type="button"
                onClick={() => onAbrir(o.id)}
                className="shrink-0 rounded-full bg-carbon px-3 py-1.5 text-xs font-semibold text-crema"
              >
                Ver
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};
