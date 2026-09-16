"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSessionStore, type CurrentRole } from "@/lib/store/session-store";
import { useConfigStore } from "@/lib/store/config-store";
import { panelHomePath, type ModuleFlags } from "@/lib/modules";
import { useDeviceMode } from "@/lib/hooks/useDeviceMode";
import {
  fallbackPath,
  operationalNavLinks,
  type OperationalNavLink,
} from "@/lib/operation";

export interface OperationalAccess {
  role: CurrentRole;
  ready: boolean;
  activos: ModuleFlags;
  visibles: ModuleFlags;
  homePath: string;
  links: OperationalNavLink[];
  canManage: boolean;
  isOwner: boolean;
}

/* Branch contract + device preference + the signed-in role. Nav, redirects
 * and page guards should all read this instead of repeating the three flags. */
export const useOperationalAccess = (): OperationalAccess => {
  const role = useSessionStore((s) => s.rol);
  const moduloPedidos = useConfigStore((s) => s.moduloPedidos);
  const moduloEspera = useConfigStore((s) => s.moduloEspera);
  const moduloPagos = useConfigStore((s) => s.moduloPagos);
  const ready = useConfigStore((s) => s.branchConfigReady);
  const dispositivo = useDeviceMode();
  const activos: ModuleFlags = {
    pedidos: moduloPedidos,
    espera: moduloEspera,
    pagos: moduloPagos,
  };
  /* Nav and screens use what the branch contracted. Device mode only
   * chooses the landing path (reception tablet vs counter), it must not
   * hide Pedidos/Mesas/Pagos on a waiter's phone. */
  return {
    role,
    ready,
    activos,
    visibles: activos,
    homePath: panelHomePath(activos, dispositivo),
    links: operationalNavLinks(role, activos),
    canManage: role === "admin" || role === "supervisor" || role === "superadmin",
    isOwner: role === "admin",
  };
};

/* If the selected branch does not have the module of the current URL, leave
 * that screen. The empty "this branch doesn't have X" cards must not appear
 * as an operational destination. */
export const useModuleRedirect = (): void => {
  const path = usePathname();
  const router = useRouter();
  const { visibles, ready } = useOperationalAccess();

  useEffect(() => {
    if (!ready) return;
    const dest = fallbackPath(path, visibles);
    if (dest) router.replace(dest);
  }, [ready, path, visibles, router]);
};
