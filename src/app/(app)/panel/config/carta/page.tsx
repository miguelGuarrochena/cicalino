"use client";

import { MenuManager } from "@/components/panel/config/menu/MenuManager";
import { useSessionStore } from "@/lib/store/session-store";

const ConfigCartaPage = () => {
  const branchId = useSessionStore((s) => s.sucursalId);
  return <MenuManager key={branchId} />;
};

export default ConfigCartaPage;
