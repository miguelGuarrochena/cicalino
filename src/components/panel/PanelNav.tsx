"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/providers/Providers";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import { navLinkActive } from "@/lib/operation";
import { NavIconSvg } from "@/components/panel/NavIcons";

export const PanelNav = ({ variant = "top" }: { variant?: "top" | "bottom" }) => {
  const path = usePathname();
  const { t } = useApp();
  const { links } = useOperationalAccess();

  if (variant === "bottom") {
    return (
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-linea bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden print:hidden">
        {links.map((l) => {
          const active = navLinkActive(l.href, path);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-semibold transition ${
                active ? "text-marca" : "text-carbon/50"
              }`}
            >
              <NavIconSvg k={l.icon} size={22} />
              {t(l.key)}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="hidden items-center gap-1 rounded-full bg-crema/60 p-1 sm:flex">
      {links.map((l) => {
        const active = navLinkActive(l.href, path);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              active
                ? "bg-marca text-crema"
                : "text-carbon/60 hover:bg-carbon/5 hover:text-carbon"
            }`}
          >
            {t(l.key)}
          </Link>
        );
      })}
    </nav>
  );
};
