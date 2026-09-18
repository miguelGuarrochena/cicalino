"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/providers/Providers";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import { useFloorAttention } from "@/lib/hooks/useFloorAttention";
import { usePanelAlertCounts } from "@/lib/hooks/usePanelAlerts";
import { navLinkActive } from "@/lib/operation";
import { NavIconSvg } from "@/components/panel/NavIcons";
import { CountBadge } from "@/components/ui/CountBadge";
import type { PanelAlertSource } from "@/lib/panelAlerts";

/* La pestaña de cada módulo lleva lo que ese módulo tiene sin mirar. Mesas
 * sigue leyendo su propio detalle (pedido vs cuenta) porque muestra las dos
 * cosas por separado; las otras alcanzan con el número. */
const SOURCE_BY_HREF: Record<string, PanelAlertSource> = {
  "/panel/pedidos": "pedidos",
  "/panel/espera": "recepcion",
  "/panel/pagos": "mesas",
};

export const PanelNav = ({ variant = "top" }: { variant?: "top" | "bottom" }) => {
  const path = usePathname();
  const { t } = useApp();
  const { links } = useOperationalAccess();
  const attention = useFloorAttention();
  const counts = usePanelAlertCounts();

  const pendingFor = (href: string) => {
    if (href === "/panel/pagos") return attention.headerUnseen;
    const source = SOURCE_BY_HREF[href];
    return source ? counts[source] : 0;
  };

  const navLabel = (base: string, pending: number, split: boolean) => {
    if (pending <= 0) return base;
    if (split) {
      return `${base}, ${t("nav.pedidoYCuenta", {
        p: attention.headerPedido,
        c: attention.headerCuenta,
      })}`;
    }
    return `${base}, ${t("nav.pendientes", { n: pending })}`;
  };

  if (variant === "bottom") {
    return (
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-linea bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden print:hidden">
        {links.map((l) => {
          const active = navLinkActive(l.href, path);
          const isMesas = l.href === "/panel/pagos";
          const pending = pendingFor(l.href);
          const split = isMesas && attention.headerPedido > 0 && attention.headerCuenta > 0;
          const priority = isMesas && attention.headerPriority;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-label={navLabel(t(l.key), pending, split)}
              className={`relative flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-semibold transition ${
                active ? "text-marca" : "text-carbon/50"
              }`}
            >
              <span className="relative">
                <NavIconSvg k={l.icon} size={22} />
                {/* Pegado a la esquina del ícono, pisándolo un cuarto: menos
                    que eso no se lee como globo, más que eso tapa el ícono y
                    el mozo pierde de qué sección es. */}
                <CountBadge
                  n={active ? 0 : pending}
                  tone={priority ? "curso" : "marca"}
                  pulse
                  className="absolute -right-5 -top-4"
                />
              </span>
              <span className="max-w-full truncate px-1">{t(l.key)}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  /* gap-2: el globo asoma 8 px por el borde derecho, y ese hueco es justo para
   * que caiga ahí y no encima de la píldora siguiente. */
  return (
    <nav className="hidden items-center gap-2 rounded-full bg-crema/60 p-1 sm:flex">
      {links.map((l) => {
        const active = navLinkActive(l.href, path);
        const isMesas = l.href === "/panel/pagos";
        const pending = pendingFor(l.href);
        const split = isMesas && attention.headerPedido > 0 && attention.headerCuenta > 0;
        const priority = isMesas && attention.headerPriority;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-label={navLabel(t(l.key), pending, split)}
            className={`relative flex min-h-11 min-w-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              active
                ? "bg-marca text-crema"
                : "text-carbon/60 hover:bg-carbon/5 hover:text-carbon"
            }`}
          >
            <NavIconSvg k={l.icon} size={18} />
            <span className="truncate">{t(l.key)}</span>
            {/* Asomado por el borde, como el globito de mensajes sin leer:
                adentro del botón se lee como un detalle del botón, y afuera
                se lee como "hay algo esperándote". */}
            <CountBadge
              n={active ? 0 : pending}
              tone={priority ? "curso" : "marca"}
              pulse
              className="absolute -right-2 -top-2"
            />
          </Link>
        );
      })}
    </nav>
  );
};
