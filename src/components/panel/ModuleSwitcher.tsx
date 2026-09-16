"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/providers/Providers";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import type { ModuleId } from "@/lib/modules";

export const ModuleSwitcher = () => {
  const { t } = useApp();
  const path = usePathname();
  const { visibles } = useOperationalAccess();

  if (!(visibles.pedidos && visibles.espera)) return null;

  const active: ModuleId = path.startsWith("/panel/espera") ? "espera" : "pedidos";

  return (
    <div
      className="mb-5 flex w-full rounded-2xl border border-linea bg-crema/40 p-1"
      role="tablist"
      aria-label={t("modulos.aria")}
    >
      <Link
        href="/panel"
        role="tab"
        aria-selected={active === "pedidos"}
        className={`flex min-h-11 flex-1 items-center justify-center rounded-xl px-3 text-sm font-semibold transition ${
          active === "pedidos"
            ? "bg-marca text-crema shadow-sm"
            : "text-carbon/60 hover:text-carbon"
        }`}
      >
        {t("modulos.pedidos")}
      </Link>
      <Link
        href="/panel/espera"
        role="tab"
        aria-selected={active === "espera"}
        className={`flex min-h-11 flex-1 items-center justify-center rounded-xl px-3 text-sm font-semibold transition ${
          active === "espera"
            ? "bg-espera text-crema shadow-sm"
            : "text-carbon/60 hover:text-carbon"
        }`}
      >
        {t("modulos.espera")}
      </Link>
    </div>
  );
};
