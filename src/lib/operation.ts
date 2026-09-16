import type { CurrentRole } from "@/lib/store/session-store";
import {
  panelHomePath,
  type ModuleFlags,
  type ModuleId,
} from "@/lib/modules";

export type NavIcon = "orders" | "espera" | "mesas" | "settings";

export type OperationalNavLink = {
  href: string;
  key: string;
  roles: CurrentRole[];
  icon: NavIcon;
  module?: ModuleId;
};

/* Floor nav answers "what can I do in this branch?", not "what exists in
 * Cicalino". Metrics live under Configuración: they are business numbers,
 * not a waiter screen. */
export const OPERATIONAL_NAV: OperationalNavLink[] = [
  {
    href: "/panel",
    key: "nav.pedidos",
    roles: ["admin", "supervisor", "empleado"],
    icon: "orders",
    module: "pedidos",
  },
  {
    href: "/panel/espera",
    key: "nav.espera",
    roles: ["admin", "supervisor", "empleado"],
    icon: "espera",
    module: "espera",
  },
  {
    href: "/panel/mesas",
    key: "nav.pagos",
    roles: ["admin", "supervisor", "empleado"],
    icon: "mesas",
    module: "pagos",
  },
  {
    href: "/panel/config",
    key: "nav.config",
    roles: ["admin", "supervisor"],
    icon: "settings",
  },
];

export const hasAnyOperationalModule = (m: ModuleFlags): boolean =>
  m.pedidos || m.espera || m.pagos;

/** Which contracted module a panel URL belongs to, if any. */
export const moduleForPath = (path: string): ModuleId | null => {
  if (path.startsWith("/panel/espera")) return "espera";
  if (path.startsWith("/panel/mesas")) return "pagos";
  if (
    path.startsWith("/panel/config") ||
    path.startsWith("/panel/metrics") ||
    path.startsWith("/panel/ayuda")
  ) {
    return null;
  }
  if (path === "/panel" || path.startsWith("/panel?")) return "pedidos";
  return null;
};

export const pathAllowedForModules = (
  path: string,
  visibles: ModuleFlags,
): boolean => {
  const needed = moduleForPath(path);
  if (!needed) return true;
  return visibles[needed];
};

/** Where to send the user when this URL is not a module of the current branch. */
export const fallbackPath = (
  path: string,
  visibles: ModuleFlags,
): string | null => {
  if (pathAllowedForModules(path, visibles)) return null;
  if (!hasAnyOperationalModule(visibles)) return null;
  const home = panelHomePath(visibles);
  return home === path ? null : home;
};

export const navLinkActive = (href: string, path: string): boolean => {
  if (href === "/panel") return path === "/panel";
  if (href === "/panel/config") {
    return path.startsWith("/panel/config") || path.startsWith("/panel/metrics");
  }
  return path.startsWith(href);
};

export const operationalNavLinks = (
  role: CurrentRole,
  visibles: ModuleFlags,
): OperationalNavLink[] =>
  OPERATIONAL_NAV.filter((l) => {
    if (!l.roles.includes(role)) return false;
    if (l.module && !visibles[l.module]) return false;
    return true;
  });
