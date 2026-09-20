"use client";

import { useApp } from "@/components/providers/Providers";
import { useFloorAttention } from "@/lib/hooks/useFloorAttention";
import { usePanelAlertCounts } from "@/lib/hooks/usePanelAlerts";
import type { PanelAlertSource } from "@/lib/panelAlerts";

/* Lo que cada módulo tiene sin mirar, listo para colgar de un botón.
 *
 * Vivía adentro de PanelNav. Cuando el hub —la pantalla de "¿qué querés
 * hacer?"— tuvo que mostrar lo mismo, copiarlo habría dejado dos lugares
 * donde arreglar el día que cambie de dónde sale un número.
 *
 * Mesas sigue leyendo su propio detalle (pedido vs cuenta) porque muestra las
 * dos cosas por separado; las otras alcanzan con el número. */
const SOURCE_BY_HREF: Record<string, PanelAlertSource> = {
  "/panel/pedidos": "pedidos",
  "/panel/espera": "recepcion",
  "/panel/pagos": "mesas",
};

export interface NavPending {
  /** Cuántas cosas esperando. 0 es "no cuelgues nada". */
  n: number;
  /** Mesas pasa a naranja cuando lo que espera es una cuenta. */
  tone: "marca" | "curso";
  /** El nombre de la sección con el pendiente adentro, para quien no ve el
   *  globo: el número es `aria-hidden` y solo. */
  label: (base: string) => string;
}

export const useNavPending = (): ((href: string) => NavPending) => {
  const { t } = useApp();
  const attention = useFloorAttention();
  const counts = usePanelAlertCounts();

  return (href: string): NavPending => {
    const esMesas = href === "/panel/pagos";
    const source = SOURCE_BY_HREF[href];
    const n = esMesas ? attention.headerUnseen : source ? counts[source] : 0;
    const split =
      esMesas && attention.headerPedido > 0 && attention.headerCuenta > 0;

    return {
      n,
      tone: esMesas && attention.headerPriority ? "curso" : "marca",
      label: (base: string) => {
        if (n <= 0) return base;
        if (split) {
          return `${base}, ${t("nav.pedidoYCuenta", {
            p: attention.headerPedido,
            c: attention.headerCuenta,
          })}`;
        }
        return `${base}, ${t("nav.pendientes", { n })}`;
      },
    };
  };
};
