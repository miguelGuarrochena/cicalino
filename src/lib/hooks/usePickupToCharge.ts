"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseConfigured } from "@/lib/supabase/config";
import { isRealBranchId, subscribeOrders } from "@/lib/data/orders";
import { fetchOrdersToCharge } from "@/lib/data/pickup";
import { attachLiveRefresh, coalesced } from "@/lib/realtime";
import { sortToCharge, type PickupOrder } from "@/lib/tablePickup";

/* Lo que la caja tiene que cobrar, en vivo. Realtime de `pedidos` primero y
 * el poll como piso, igual que el tablero. */
export const usePickupToCharge = (
  branchId: string | null,
  enabled: boolean,
): { orders: PickupOrder[]; ready: boolean; refresh: () => void } => {
  const [orders, setOrders] = useState<PickupOrder[]>([]);
  const [ready, setReady] = useState(false);
  const reloadRef = useRef<() => void>(() => {});
  const live = enabled && supabaseConfigured && isRealBranchId(branchId);

  useEffect(() => {
    if (!live || !branchId) {
      reloadRef.current = () => {};
      return;
    }
    let alive = true;
    const reload = coalesced(async () => {
      const res = await fetchOrdersToCharge(branchId);
      /* Un refresco fallido no vacía la lista: se queda con la última buena. */
      if (!alive || !res.ok) return;
      setOrders(sortToCharge(res.data));
      setReady(true);
    });
    reloadRef.current = () => void reload();
    const stop = attachLiveRefresh({
      subscribe: (onChange) => subscribeOrders(branchId, onChange, ":cobrar"),
      reload: () => void reload(),
      ticksSano: 4,
    });
    void reload();
    return () => {
      alive = false;
      stop();
    };
  }, [live, branchId, enabled]);

  const refresh = useCallback(() => reloadRef.current(), []);
  /* Sin la modalidad (o sin sucursal real) no hay nada que cobrar: se deriva
   * acá en vez de vaciar el estado dentro del efecto. */
  return live ? { orders, ready, refresh } : { orders: [], ready: !enabled, refresh };
};
