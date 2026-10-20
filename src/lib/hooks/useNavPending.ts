"use client";

import { useApp } from "@/components/providers/Providers";
import { useFloorAttention } from "@/lib/hooks/useFloorAttention";
import { usePanelAlertCounts, usePanelAlerts } from "@/lib/hooks/usePanelAlerts";
import type { PanelAlertSource } from "@/lib/panelAlerts";

/* Lo que cada módulo tiene sin mirar, listo para colgar de un botón.
 *
 * Vivía adentro de PanelNav. Cuando el hub —la pantalla de "¿qué querés
 * hacer?"— tuvo que mostrar lo mismo, copiarlo habría dejado dos lugares
 * donde arreglar el día que cambie de dónde sale un número.
 *
 * Pagos suma las dos colas que se resuelven adentro: comandas sin enviar y
 * cobros pendientes. El resto de los módulos alcanza con los avisos que
 * todavía nadie miró. */
const SOURCE_BY_HREF: Record<string, PanelAlertSource> = {
  "/panel/pedidos": "pedidos",
  "/panel/espera": "recepcion",
  "/panel/pagos": "mesas",
  "/panel/cocina": "cocina",
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
type NavTone = "marca" | "espera" | "pagos" | "ok";

const TONE_BY_HREF: Record<string, NavTone> = {
  "/panel/pedidos": "marca",
  "/panel/espera": "espera",
  "/panel/pagos": "pagos",
  "/panel/cocina": "ok",
};

export interface NavPending {
  /** Cuántas cosas esperando. 0 es "no cuelgues nada". */
  n: number;
  /** El color del módulo del que salió el número. */
  tone: NavTone;
  /** Late solo cuando llegó algo que nadie miró. El número de Pagos queda
   *  quieto mientras el trabajo sigue pendiente: si latiera por el saldo, el
   *  salón lo vería moverse toda la noche. */
  pulse: boolean;
  /** Se sigue viendo con la sección abierta. Pagos lo necesita: el número de
   *  la barra es la suma, y adentro cada pestaña muestra la suya. */
  sticky: boolean;
  /** El nombre de la sección con el pendiente adentro, para quien no ve el
   *  globo: el número es `aria-hidden` y solo. */
  label: (base: string) => string;
}

export const useNavPending = (): ((href: string) => NavPending) => {
  const { t } = useApp();
  const attention = useFloorAttention();
  const counts = usePanelAlertCounts();
  /* El latido de Pagos sigue siendo "llegó algo": comandas, cuentas, llamados
   * y el plato que cocina ya terminó. El número es otra cosa, y no los suma. */
  const hechasMesa = usePanelAlerts().filter(
    (a) => a.kind === "cocina-lista" && a.source === "mesas",
  ).length;

  return (href: string): NavPending => {
    const esMesas = href === "/panel/pagos";
    const source = SOURCE_BY_HREF[href];
    const comandas = attention.pendingComandas;
    const cobrar = attention.pendingCharges;
    const n = esMesas ? comandas + cobrar : source ? counts[source] : 0;

    return {
      n,
      tone: TONE_BY_HREF[href] ?? "marca",
      pulse: esMesas ? attention.headerUnseen > 0 || hechasMesa > 0 : n > 0,
      sticky: esMesas,
      label: (base: string) => {
        if (n <= 0) return base;
        if (esMesas && comandas > 0 && cobrar > 0) {
          return `${base}, ${t("nav.pedidoYCuenta", { p: comandas, c: cobrar })}`;
        }
        return `${base}, ${t("nav.pendientes", { n })}`;
      },
    };
  };
};
