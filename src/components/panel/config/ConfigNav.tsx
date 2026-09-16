"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/providers/Providers";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import { useConfigStore } from "@/lib/store/config-store";

type Tab = {
  id: string;
  href: string;
  key: string;
  show: boolean;
};

export const ConfigNav = () => {
  const { t } = useApp();
  const path = usePathname();
  const { isOwner, visibles } = useOperationalAccess();
  const modo = useConfigStore((s) => s.modo);
  const showMesas = visibles.espera || visibles.pagos || modo === "mesa";
  const onMetrics = path.startsWith("/panel/config/metricas");
  const [hash, setHash] = useState("general");

  useEffect(() => {
    const sync = () => setHash(window.location.hash.replace("#", "") || "general");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [path]);

  const tabs: Tab[] = [
    { id: "general", href: "/panel/config#general", key: "config.tab.general", show: true },
    { id: "carta", href: "/panel/config#carta", key: "config.tab.carta", show: visibles.pagos },
    { id: "mesas", href: "/panel/config#mesas", key: "config.tab.mesas", show: showMesas },
    { id: "empleados", href: "/panel/config#empleados", key: "config.tab.empleados", show: true },
    { id: "pagos", href: "/panel/config#pagos", key: "config.tab.pagos", show: visibles.pagos },
    { id: "modulos", href: "/panel/config#modulos", key: "config.tab.modulos", show: true },
    { id: "metricas", href: "/panel/config/metricas", key: "config.tab.metricas", show: isOwner },
  ];

  const current = onMetrics ? "metricas" : hash;

  return (
    <nav
      aria-label={t("config.titulo")}
      className="sticky top-[3.25rem] z-10 -mx-1 overflow-x-auto bg-crema/90 px-1 py-1 backdrop-blur-md sm:top-[4.25rem] print:hidden"
    >
      <ul className="flex min-w-max gap-1 rounded-full border border-linea bg-surface/80 p-1">
        {tabs
          .filter((tab) => tab.show)
          .map((tab) => {
            const selected = current === tab.id;
            return (
              <li key={tab.id}>
                <Link
                  href={tab.href}
                  aria-current={selected ? "page" : undefined}
                  onClick={() => {
                    if (tab.id !== "metricas") setHash(tab.id);
                  }}
                  className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-semibold transition ${
                    selected
                      ? "bg-marca text-crema"
                      : "text-carbon/60 hover:bg-carbon/5 hover:text-carbon"
                  }`}
                >
                  {t(tab.key)}
                </Link>
              </li>
            );
          })}
      </ul>
    </nav>
  );
};
