"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSessionStore, type CurrentRole } from "@/lib/store/session-store";
import { useConfigStore } from "@/lib/store/config-store";
import {
  panelHomePath,
  pedidosEnMesa,
  pedidosMostradorQr,
  usesTableMenu,
  type ModuleFlags,
} from "@/lib/modules";
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
  /* Pedidos en modalidad Mesa (el cliente pide y paga desde el QR). */
  pedidosEnMesa: boolean;
  /* Pedidos en modalidad Mostrador QR (un QR del local, se paga ahora o al
   * retirar). */
  pedidosMostradorQr: boolean;
  /* Carta, métodos de cobro y Mercado Pago: Pagos o Pedidos desde un QR. */
  usesMenu: boolean;
}

/* Branch contract + device preference + the signed-in role. Nav, redirects
 * and page guards should all read this instead of repeating the three flags. */
export const useOperationalAccess = (): OperationalAccess => {
  const role = useSessionStore((s) => s.rol);
  const moduloPedidos = useConfigStore((s) => s.moduloPedidos);
  const moduloEspera = useConfigStore((s) => s.moduloEspera);
  const moduloPagos = useConfigStore((s) => s.moduloPagos);
  const ready = useConfigStore((s) => s.branchConfigReady);
  const modalidad = useConfigStore((s) => s.pedidosModalidad);
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
    pedidosEnMesa: pedidosEnMesa(activos, modalidad),
    pedidosMostradorQr: pedidosMostradorQr(activos, modalidad),
    usesMenu: usesTableMenu(activos, modalidad),
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
