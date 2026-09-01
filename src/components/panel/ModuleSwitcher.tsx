"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/providers/Providers";
import { useConfigStore } from "@/lib/store/config-store";
import {
  readDeviceMode,
  visibleModules,
  type ModuleId,
} from "@/lib/modules";
import { useSyncExternalStore } from "react";

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};
const getSnapshot = () => readDeviceMode();
const getServer = () => "ambos" as const;

export const ModuleSwitcher = () => {
  const { t } = useApp();
  const path = usePathname();
  const moduloPedidos = useConfigStore((s) => s.moduloPedidos);
  const moduloEspera = useConfigStore((s) => s.moduloEspera);
  const dispositivo = useSyncExternalStore(subscribe, getSnapshot, getServer);
  const visibles = visibleModules(
    { pedidos: moduloPedidos, espera: moduloEspera },
    dispositivo,
  );

  if (!(visibles.pedidos && visibles.espera)) return null;

  const active: ModuleId = path.startsWith("/panel/espera") ? "espera" : "pedidos";

  return (
    <div
      className="mb-5 flex w-full rounded-2xl border border-linea bg-surface p-1 shadow-sm"
      role="tablist"
      aria-label={t("modulos.aria")}
    >
      <Link
        href="/panel"
        role="tab"
        aria-selected={active === "pedidos"}
        className={`flex flex-1 items-center justify-center rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
          active === "pedidos"
            ? "bg-marca text-crema shadow-sm"
            : "text-carbon/55 hover:bg-carbon/5 hover:text-carbon"
        }`}
      >
        {t("modulos.pedidos")}
      </Link>
      <Link
        href="/panel/espera"
        role="tab"
        aria-selected={active === "espera"}
        className={`flex flex-1 items-center justify-center rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
          active === "espera"
            ? "bg-espera text-crema shadow-sm"
            : "text-carbon/55 hover:bg-carbon/5 hover:text-carbon"
        }`}
      >
        {t("modulos.espera")}
      </Link>
    </div>
  );
};
