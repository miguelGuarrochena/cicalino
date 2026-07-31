"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type IconKey = "empresas" | "solicitudes" | "cobros" | "clientes";

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
  if (k === "empresas")
    return (
      <svg {...common}>
        <path d="M3 21h18M5 21V7l7-4 7 4v14" />
        <path d="M10 21v-6h4v6" />
      </svg>
    );
  if (k === "solicitudes")
    return (
      <svg {...common}>
        <path d="M4 4h16v12H8l-4 4V4z" />
      </svg>
    );
  if (k === "cobros")
    return (
      <svg {...common}>
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
    </svg>
  );
};

const ITEMS: { href: string; label: string; icon: IconKey }[] = [
  { href: "/admin", label: "Empresas", icon: "empresas" },
  { href: "/admin#solicitudes", label: "Solicitudes", icon: "solicitudes" },
  { href: "/admin#cobros", label: "Cobros", icon: "cobros" },
  { href: "/admin#clientes", label: "Clientes", icon: "clientes" },
];

export const AdminBottomNav = () => {
  const path = usePathname();
  if (path !== "/admin") return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-linea bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden">
      {ITEMS.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold text-carbon/55 transition active:text-marca"
        >
          <Icon k={i.icon} />
          {i.label}
        </Link>
      ))}
    </nav>
  );
};
