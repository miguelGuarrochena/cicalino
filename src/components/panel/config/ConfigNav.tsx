"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/providers/Providers";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import { useConfigStore } from "@/lib/store/config-store";
import {
  goToConfigSection,
  readConfigSection,
  subscribeConfigSection,
} from "@/components/panel/config/configHash";

type Tab = {
  id: string;
  href: string;
  key: string;
  show: boolean;
  inPage: boolean;
};

export const ConfigNav = () => {
  const { t } = useApp();
  const path = usePathname();
  const { isOwner, visibles } = useOperationalAccess();
  const modo = useConfigStore((s) => s.modo);
  const moduloPedidos = useConfigStore((s) => s.moduloPedidos);
  const moduloEspera = useConfigStore((s) => s.moduloEspera);
  const showMesas = visibles.espera || visibles.pagos || modo === "mesa";
  const onMetrics = path.startsWith("/panel/config/metricas");
  const onConfigHome = path === "/panel/config";
  const [hash, setHash] = useState("");

  useEffect(() => {
    const sync = () => setHash(readConfigSection());
    sync();
    return subscribeConfigSection(sync);
  }, [path]);

  const tabs: Tab[] = [
    { id: "identidad", href: "/panel/config#identidad", key: "config.tab.identidad", show: true, inPage: true },
    { id: "pagos", href: "/panel/config#pagos", key: "config.tab.pagos", show: visibles.pagos, inPage: true },
    { id: "mesas", href: "/panel/config#mesas", key: "config.tab.mesas", show: showMesas, inPage: true },
    { id: "empleados", href: "/panel/config#empleados", key: "config.tab.empleados", show: true, inPage: true },
    {
      id: "dispositivo",
      href: "/panel/config#dispositivo",
      key: "config.tab.dispositivo",
      show: moduloPedidos && moduloEspera,
      inPage: true,
    },
    { id: "avanzado", href: "/panel/config#avanzado", key: "config.tab.avanzado", show: true, inPage: true },
    { id: "carta", href: "/panel/menu", key: "config.tab.carta", show: visibles.pagos, inPage: false },
    { id: "metricas", href: "/panel/config/metricas", key: "config.tab.metricas", show: isOwner, inPage: false },
  ];

  const current = onMetrics ? "metricas" : hash;

  const openSection = (id: string, e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (!onConfigHome) return;
    e.preventDefault();
    goToConfigSection(id);
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <nav
      aria-label={t("config.titulo")}
      className="sticky top-[3.25rem] z-10 -mx-1 min-w-0 bg-crema/90 px-1 py-1 backdrop-blur-md sm:top-[4.25rem] print:hidden"
    >
      <ul className="flex flex-wrap gap-1 rounded-2xl border border-linea bg-surface/80 p-1">
        {tabs
          .filter((tab) => tab.show)
          .map((tab) => {
            const selected = current === tab.id;
            const className = `inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-xs font-semibold transition sm:min-h-10 sm:px-3.5 sm:text-sm ${
              selected
                ? "bg-marca text-crema"
                : "text-carbon/60 hover:bg-carbon/5 hover:text-carbon"
            }`;
            return (
              <li key={tab.id}>
                {tab.inPage ? (
                  <a
                    href={tab.href}
                    aria-current={selected ? "page" : undefined}
                    onClick={(e) => openSection(tab.id, e)}
                    className={className}
                  >
                    {t(tab.key)}
                  </a>
                ) : (
                  <Link
                    href={tab.href}
                    scroll={false}
                    aria-current={selected ? "page" : undefined}
                    className={className}
                  >
                    {t(tab.key)}
                  </Link>
                )}
              </li>
            );
          })}
      </ul>
    </nav>
  );
};
