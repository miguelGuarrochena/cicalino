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

const PILL =
  "inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-xs font-semibold transition sm:min-h-10 sm:px-3.5 sm:text-sm";

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
  const enPagina = tabs.filter((tab) => tab.show && tab.inPage);
  const salidas = tabs.filter((tab) => tab.show && !tab.inPage);

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
      {/* Dos grupos, no una fila pareja. Los primeros abren una sección de
          esta misma pantalla; Menú y Métricas se van a otra página y llevaban
          la misma píldora, así que tocar "Menú" se sentía como perder lo que
          estabas editando. Van a la derecha, separados por una línea y con una
          flechita, que es la diferencia que hacía falta. */}
      <ul className="flex flex-wrap items-center gap-1 rounded-2xl border border-linea bg-surface/80 p-1">
        {enPagina.map((tab) => {
          const selected = current === tab.id;
          return (
            <li key={tab.id}>
              <a
                href={tab.href}
                aria-current={selected ? "page" : undefined}
                onClick={(e) => openSection(tab.id, e)}
                className={`${PILL} ${
                  selected
                    ? "bg-marca text-crema"
                    : "text-carbon/60 hover:bg-carbon/5 hover:text-carbon"
                }`}
              >
                {t(tab.key)}
              </a>
            </li>
          );
        })}
        {salidas.map((tab, i) => {
          const selected = current === tab.id;
          return (
            <li
              key={tab.id}
              className={
                i === 0
                  ? "flex items-center gap-1 sm:ml-auto sm:border-l sm:border-linea sm:pl-1.5"
                  : undefined
              }
            >
              <Link
                href={tab.href}
                scroll={false}
                aria-current={selected ? "page" : undefined}
                className={`${PILL} gap-1 border ${
                  selected
                    ? "border-marca bg-marca text-crema"
                    : "border-linea text-carbon/60 hover:bg-carbon/5 hover:text-carbon"
                }`}
              >
                {t(tab.key)}
                <span aria-hidden className="text-[0.9em] leading-none">
                  ↗
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
