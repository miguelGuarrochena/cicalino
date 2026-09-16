"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/providers/Providers";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import { navLinkActive, type NavIcon } from "@/lib/operation";

const Icon = ({ k }: { k: NavIcon }) => {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (k === "orders")
    return (
      <svg {...common}>
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    );
  if (k === "espera")
    return (
      <svg {...common}>
        <rect x="4" y="4" width="6" height="6" rx="1" />
        <rect x="14" y="4" width="6" height="6" rx="1" />
        <rect x="4" y="14" width="6" height="6" rx="1" />
        <rect x="14" y="14" width="6" height="6" rx="1" />
      </svg>
    );
  if (k === "mesas")
    return (
      <svg {...common}>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
        <path d="M9 8h6M9 12h6" />
      </svg>
    );
  return null;
};

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
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold transition ${
                active ? "text-marca" : "text-carbon/50"
              }`}
            >
              <Icon k={l.icon} />
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
