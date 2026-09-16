"use client";

import { MenuWorkspace } from "@/components/panel/menu/MenuWorkspace";
import { useSessionStore } from "@/lib/store/session-store";

/* Configuración → Menú. Its own page, outside the settings layout: building
 * and maintaining the menu is a job in itself, not a settings card. */
const MenuPage = () => {
  const branchId = useSessionStore((s) => s.sucursalId);
  return <MenuWorkspace key={branchId ?? "sin-sucursal"} />;
};

export default MenuPage;
