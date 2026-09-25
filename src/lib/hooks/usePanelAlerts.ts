"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useSessionStore } from "@/lib/store/session-store";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import { useJornadaActiva } from "@/lib/hooks/useJornadaActiva";
import { supabaseConfigured } from "@/lib/supabase/config";
import {
  isRealBranchId,
  fetchPendingCounterOrders,
  subscribeOrders,
} from "@/lib/data/orders";
import { attachLiveRefresh, coalesced } from "@/lib/realtime";
import {
  arrivedIds,
  cajaAlerts,
  counterAlerts,
  type PanelAlert,
} from "@/lib/panelAlerts";
import { fetchOrdersToCharge } from "@/lib/data/pickup";
import {
  ackPanelSource,
  getLiveAlertCounts,
  getLiveAlerts,
  getPanelAlertState,
  getPanelAlertVersion,
  hydratePanelAlerts,
  publishPanelAlerts,
  subscribePanelAlerts,
} from "@/lib/store/panel-alert-store";
import { dingNew, vibrate } from "@/lib/sound";
import type { PanelAlertSource } from "@/lib/panelAlerts";

const useAlertVersion = (): number =>
  useSyncExternalStore(subscribePanelAlerts, getPanelAlertVersion, () => 0);

/** Lo que hay que gritar ahora mismo, esté el empleado donde esté. */
export const usePanelAlerts = (): PanelAlert[] => {
  const version = useAlertVersion();
  void version;
  return getLiveAlerts();
};

export const usePanelAlertCounts = (): Record<PanelAlertSource, number> => {
  const version = useAlertVersion();
  void version;
  return getLiveAlertCounts();
};

/* Pedidos, escuchado desde todo el panel.
 *
 * La pantalla de Pedidos sigue teniendo su propia carga paginada: esto no la
 * reemplaza ni la duplica: lee lo mínimo (los que nadie tocó todavía) para
 * poder avisar desde Recepción, Mesas o Configuración. Misma receta que el
 * resto: realtime primero y el poll como piso si la suscripción se cayó. */
const useCounterAlertsFeed = () => {
  const branchId = useSessionStore((s) => s.sucursalId);
  const { visibles, pedidosEnMesa } = useOperationalAccess();
  const jornadaActiva = useJornadaActiva();
  const live =
    supabaseConfigured && isRealBranchId(branchId) && visibles.pedidos && jornadaActiva;

  useEffect(() => {
    if (!live || !branchId) {
      publishPanelAlerts("pedidos", []);
      return;
    }
    let alive = true;
    const reload = coalesced(async () => {
      const [res, caja] = await Promise.all([
        fetchPendingCounterOrders(branchId),
        pedidosEnMesa ? fetchOrdersToCharge(branchId) : Promise.resolve(null),
      ]);
      /* Un refresco que falló no apaga los avisos: se queda con los últimos
       * buenos, como hacen las listas de Pedidos y Recepción. */
      if (!alive || !res.ok || (caja && !caja.ok)) return;
      publishPanelAlerts("pedidos", [
        ...(caja?.ok ? cajaAlerts(caja.data) : []),
        ...counterAlerts(res.data),
      ]);
    });
    const stop = attachLiveRefresh({
      subscribe: (onChange) => subscribeOrders(branchId, onChange, ":alertas"),
      reload: () => void reload(),
      ticksSano: 4,
    });
    void reload();
    return () => {
      alive = false;
      stop();
      publishPanelAlerts("pedidos", []);
    };
  }, [live, branchId, pedidosEnMesa]);
};

/* El sonido de todo el panel, en un solo lugar.
 *
 * Suena lo que *llegó*, no lo que hay pendiente: si sonara por pendientes, el
 * mostrador escucharía un beep en cada refresco hasta que alguien atienda.
 * El silenciador del header sigue mandando — lo respeta `dingNew`. */
const useAlertSound = () => {
  const version = useAlertVersion();
  const branchId = useSessionStore((s) => s.sucursalId);
  const known = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
    primed.current = false;
    known.current = new Set();
  }, [branchId]);

  useEffect(() => {
    const st = getPanelAlertState();
    /* Hasta que Mesas publique su primer snapshot, lo que hay no es la foto
     * completa: primar ahora haría sonar todo como nuevo cuando llegue. */
    if (!st.sourceReady.mesas) return;
    const alerts = getLiveAlerts();
    const ids = new Set(alerts.map((a) => a.id));
    if (!primed.current) {
      /* Lo que ya estaba al abrir el panel no es novedad: avisar de eso sería
       * sonar cada vez que alguien cambia de pantalla. */
      primed.current = true;
      known.current = ids;
      return;
    }
    const arrived = arrivedIds(known.current, alerts);
    known.current = ids;
    if (!arrived.length) return;
    dingNew();
    const llamado = alerts.some(
      (a) => arrived.includes(a.id) && a.kind === "llamado",
    );
    /* El teléfono en el bolsillo del mozo: el llamado se tiene que sentir. */
    if (llamado) vibrate([140, 70, 140]);
  }, [version]);
};

/* Estar parado en la sección cuenta como haber mirado sus novedades: la
 * pantalla ya muestra el detalle. Siguen pendientes hasta que se resuelven —
 * Mesas lleva esa cuenta por su lado (attention-store). */
const useSectionAck = () => {
  const path = usePathname();
  const version = useAlertVersion();

  useEffect(() => {
    if (path === "/panel/pedidos") ackPanelSource("pedidos");
    if (path === "/panel/espera") ackPanelSource("recepcion");
  }, [path, version]);
};

/* Todo el cableado global junto. Se monta una sola vez, en el layout del
 * panel, así ninguna pantalla depende de que la anterior lo hubiera montado. */
export const usePanelAlertsWatch = () => {
  const branchId = useSessionStore((s) => s.sucursalId);

  useEffect(() => {
    hydratePanelAlerts(branchId);
  }, [branchId]);

  useCounterAlertsFeed();
  useAlertSound();
  useSectionAck();
};
