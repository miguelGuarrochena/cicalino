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

  const mesasLabel = (base: string, pending: number, split: boolean) => {
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
          const isMesas = l.href === "/panel/mesas";
          const pending = isMesas ? attention.headerUnseen : 0;
          const split = isMesas && attention.headerPedido > 0 && attention.headerCuenta > 0;
          const priority = isMesas && attention.headerPriority;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-label={mesasLabel(t(l.key), pending, split)}
              className={`relative flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-semibold transition ${
                active ? "text-marca" : "text-carbon/50"
              }`}
            >
              <span className="relative">
                <NavIconSvg k={l.icon} size={22} />
                <NavBadge
                  count={active ? 0 : pending}
                  priority={priority}
                  split={split}
                  compact
                />
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
        const isMesas = l.href === "/panel/mesas";
        const pending = isMesas ? attention.headerUnseen : 0;
        const split = isMesas && attention.headerPedido > 0 && attention.headerCuenta > 0;
        const priority = isMesas && attention.headerPriority;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-label={mesasLabel(t(l.key), pending, split)}
            className={`relative flex min-h-11 min-w-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              active
                ? "bg-marca text-crema"
                : "text-carbon/60 hover:bg-carbon/5 hover:text-carbon"
            }`}
          >
            <NavIconSvg k={l.icon} size={18} />
            <span className="truncate">{t(l.key)}</span>
            {pending > 0 && !active ? (
              <span className="flex shrink-0 items-center gap-1">
                {split ? <CategoryDots pulse /> : null}
                <span
                  className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                    split
                      ? "bg-carbon/10 text-carbon/70 u-attention-pulse"
                      : priority
                        ? "bg-curso text-crema u-attention-pulse-priority"
                        : "bg-marca/15 text-marca u-attention-pulse"
                  }`}
                >
                  {pending}
                </span>
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
};

const CategoryDots = ({ pulse }: { pulse?: boolean }) => (
  <span className={`flex items-center ${pulse ? "u-attention-dot" : ""}`} aria-hidden>
    <span className="size-1.5 rounded-full bg-marca" />
    <span className="-ml-0.5 size-1.5 rounded-full bg-curso ring-1 ring-crema" />
  </span>
);

const NavBadge = ({
  count,
  priority,
  split,
  compact,
}: {
  count: number;
  priority: boolean;
  split?: boolean;
  compact?: boolean;
}) => {
  if (count <= 0) return null;
  if (compact && (count === 1 || split)) {
    return (
      <span aria-hidden className="absolute -right-1 -top-0.5 flex items-center">
        {split ? (
          <>
            <span className="size-2 rounded-full bg-marca u-attention-dot" />
            <span className="-ml-0.5 size-2 rounded-full bg-curso ring-1 ring-surface u-attention-dot" />
          </>
        ) : (
          <span
            className={`size-2 rounded-full ${
              priority ? "bg-curso u-attention-dot" : "bg-marca u-attention-dot"
            }`}
          />
        )}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={`absolute -right-2 -top-1.5 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums leading-none ${
        priority ? "bg-curso text-crema" : "bg-marca text-crema"
      } ${compact ? "h-4" : ""} ${
        priority ? "u-attention-pulse-priority" : "u-attention-pulse"
      }`}
    >
      {count}
    </span>
  );
};
