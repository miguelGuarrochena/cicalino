"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/providers/Providers";
import { useSessionStore, type CurrentRole } from "@/lib/store/session-store";

type IconKey = "orders" | "chart" | "settings";

const LINKS: {
  href: string;
  key: string;
  roles: CurrentRole[];
  icon: IconKey;
}[] = [
  { href: "/panel", key: "nav.pedidos", roles: ["admin", "supervisor", "empleado"], icon: "orders" },
  { href: "/panel/metrics", key: "nav.metricas", roles: ["admin"], icon: "chart" },
  { href: "/panel/config", key: "nav.config", roles: ["admin", "supervisor"], icon: "settings" },
];

// Superadmin no opera el panel del local: su área es /admin.

const Icon = ({ k }: { k: IconKey }) => {
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
  if (k === "chart")
    return (
      <svg {...common}>
        <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
};

// variant "top": pills horizontales (desktop). "bottom": tab bar fija (mobile).
export const PanelNav = ({ variant = "top" }: { variant?: "top" | "bottom" }) => {
  const path = usePathname();
  const { t } = useApp();
  const role = useSessionStore((s) => s.rol);
  const links = LINKS.filter((l) => l.roles.includes(role));

  if (variant === "bottom") {
    return (
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-linea bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden">
        {links.map((l) => {
          const active =
            l.href === "/panel" ? path === "/panel" : path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition ${
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
        const active =
          l.href === "/panel" ? path === "/panel" : path.startsWith(l.href);
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
