"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/providers/Providers";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import { useFloorAttention } from "@/lib/hooks/useFloorAttention";
import { navLinkActive } from "@/lib/operation";
import { NavIconSvg } from "@/components/panel/NavIcons";

export const PanelNav = ({ variant = "top" }: { variant?: "top" | "bottom" }) => {
  const path = usePathname();
  const { t } = useApp();
  const { links } = useOperationalAccess();
  const attention = useFloorAttention();

  if (variant === "bottom") {
    return (
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-linea bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden print:hidden">
        {links.map((l) => {
          const active = navLinkActive(l.href, path);
          const pending = l.href === "/panel/mesas" ? attention.headerUnseen : 0;
          const priority = l.href === "/panel/mesas" && attention.headerPriority;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-label={
                pending > 0
                  ? `${t(l.key)}, ${t("nav.pendientes", { n: pending })}`
                  : t(l.key)
              }
              className={`relative flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-semibold transition ${
                active ? "text-marca" : "text-carbon/50"
              } ${pending > 0 && !active ? (priority ? "u-attention-pulse-priority" : "u-attention-pulse") : ""}`}
            >
              <span className="relative">
                <NavIconSvg k={l.icon} size={22} />
                <NavBadge count={active ? 0 : pending} priority={priority} compact />
              </span>
              <span className="max-w-full truncate px-1">{t(l.key)}</span>
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
        const pending = l.href === "/panel/mesas" ? attention.headerUnseen : 0;
        const priority = l.href === "/panel/mesas" && attention.headerPriority;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-label={
              pending > 0
                ? `${t(l.key)}, ${t("nav.pendientes", { n: pending })}`
                : t(l.key)
            }
            className={`relative flex min-h-11 min-w-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              active
                ? "bg-marca text-crema"
                : "text-carbon/60 hover:bg-carbon/5 hover:text-carbon"
            } ${pending > 0 && !active ? (priority ? "u-attention-pulse-priority" : "u-attention-pulse") : ""}`}
          >
            <NavIconSvg k={l.icon} size={18} />
            <span className="truncate">{t(l.key)}</span>
            {pending > 0 && !active ? (
              <span
                className={`inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                  priority ? "bg-alerta text-crema" : "bg-marca/15 text-marca"
                }`}
              >
                {pending}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
};

const NavBadge = ({
  count,
  priority,
  compact,
}: {
  count: number;
  priority: boolean;
  compact?: boolean;
}) => {
  if (count <= 0) return null;
  if (compact && count === 1) {
    return (
      <span
        aria-hidden
        className={`absolute -right-0.5 -top-0.5 size-2 rounded-full ${
          priority ? "bg-alerta u-attention-dot" : "bg-marca u-attention-dot"
        }`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`absolute -right-2 -top-1.5 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums leading-none ${
        priority ? "bg-alerta text-crema" : "bg-marca text-crema"
      } ${compact ? "h-4" : ""}`}
    >
      {count}
    </span>
  );
};
