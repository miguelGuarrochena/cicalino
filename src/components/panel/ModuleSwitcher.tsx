"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConfigStore } from "@/lib/store/config-store";
import {
  leerDispositivoModo,
  modulosVisibles,
  type ModuloId,
} from "@/lib/modulos";
import { useSyncExternalStore } from "react";

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};
const getSnapshot = () => leerDispositivoModo();
const getServer = () => "ambos" as const;

/**
 * Selector grande Pedidos | Espera.
 * Solo se muestra si la sucursal tiene ambos activos y el dispositivo permite ambos.
 */
export const ModuleSwitcher = () => {
  const path = usePathname();
  const moduloPedidos = useConfigStore((s) => s.moduloPedidos);
  const moduloEspera = useConfigStore((s) => s.moduloEspera);
  const dispositivo = useSyncExternalStore(subscribe, getSnapshot, getServer);
  const visibles = modulosVisibles(
    { pedidos: moduloPedidos, espera: moduloEspera },
    dispositivo,
  );

  if (!(visibles.pedidos && visibles.espera)) return null;

  const active: ModuloId = path.startsWith("/panel/espera") ? "espera" : "pedidos";

  return (
    <div
      className="mb-5 flex w-full rounded-2xl border border-linea bg-surface p-1 shadow-sm"
      role="tablist"
      aria-label="Módulo"
    >
      <Link
        href="/panel"
        role="tab"
        aria-selected={active === "pedidos"}
        className={`flex flex-1 items-center justify-center rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
          active === "pedidos"
            ? "bg-marca text-crema shadow-sm"
            : "text-carbon/55 hover:bg-carbon/5 hover:text-carbon"
        }`}
      >
        Pedidos
      </Link>
      <Link
        href="/panel/espera"
        role="tab"
        aria-selected={active === "espera"}
        className={`flex flex-1 items-center justify-center rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
          active === "espera"
            ? "bg-espera text-crema shadow-sm"
            : "text-carbon/55 hover:bg-carbon/5 hover:text-carbon"
        }`}
      >
        Espera de mesa
      </Link>
    </div>
  );
};
