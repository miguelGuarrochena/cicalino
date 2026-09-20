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

/* El globo de cada sección lleva el color de esa sección: el mismo que su
 * círculo en el hub y el mismo que su ícono en la nav.
 *
 * Pagos late rosa aunque lo que espere sea una cuenta por cobrar. Antes se
 * ponía ámbar en ese caso, y la condición era "hay al menos una cuenta
 * esperando": en hora pico eso es casi siempre, así que el color del módulo no
 * se veía nunca y el ámbar dejaba de significar algo. La distinción sigue
 * donde se puede hacer algo con ella: el dock la dice con palabras desde
 * cualquier pantalla, y adentro de Pagos la pestaña Cobrar late sola. */
type NavTone = "marca" | "espera" | "pagos";

const TONE_BY_HREF: Record<string, NavTone> = {
  "/panel/pedidos": "marca",
  "/panel/espera": "espera",
  "/panel/pagos": "pagos",
};

export interface NavPending {
  /** Cuántas cosas esperando. 0 es "no cuelgues nada". */
  n: number;
  /** El color del módulo del que salió el número. */
  tone: NavTone;
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
      tone: TONE_BY_HREF[href] ?? "marca",
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
