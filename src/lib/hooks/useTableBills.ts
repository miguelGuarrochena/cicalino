"use client";

import { useCallback, useSyncExternalStore } from "react";
import { supabaseConfigured } from "@/lib/supabase/config";
import { isRealBranchId } from "@/lib/data/orders";
import { fetchTableBills, subscribeTableBills } from "@/lib/data/tables";
import { attachLiveRefresh, coalesced } from "@/lib/realtime";
import type { DataError } from "@/lib/data/result";
import type { TableBill } from "@/lib/tableBill";

/* One live subscription per branch. The header needs the same bills as
 * Mesas, and two `table-bills-${id}` channels would fight each other. */

const RELEASE_MS = 200;

type Shared = {
  branchId: string;
  bills: TableBill[];
  ready: boolean;
  live: boolean;
  syncError: DataError | null;
  version: number;
  refs: number;
  listeners: Set<() => void>;
  refresh: () => Promise<void>;
  stop: () => void;
};

let shared: Shared | null = null;
let releaseTimer: number | undefined;

const emit = (s: Shared) => {
  s.version += 1;
  for (const l of s.listeners) l();
};

const start = (branchId: string): Shared => {
  const live = true;
  let stopped = false;
  const reload = coalesced(async () => {
    if (stopped) return;
    const res = await fetchTableBills(branchId);
    if (stopped || shared?.branchId !== branchId) return;
    if (res.ok) {
      shared.bills = res.data;
      shared.syncError = null;
      shared.ready = true;
    } else {
      /* Una carga que falló no publica lista vacía ni pisa el último
       * snapshot. ready queda en false hasta el primer ok. */
      shared.syncError = res.error;
    }
    emit(shared);
  });

  /* Same live path as Pedidos and Recepción: Realtime first, then a visible
   * poll so a missed session UPDATE (waiter call, guest order, bill request)
   * does not wait for a staff click. */
  const stopLive = attachLiveRefresh({
    subscribe: (onChange) => subscribeTableBills(branchId, onChange),
    reload: () => {
      if (!stopped) void reload();
    },
    ticksSano: 4,
  });
  void reload();

  const slot: Shared = {
    branchId,
    bills: [],
    ready: false,
    live,
    syncError: null,
    version: 0,
    refs: 0,
    listeners: new Set(),
    refresh: () => reload(),
    stop: () => {
      stopped = true;
      stopLive();
    },
  };
  return slot;
};

const retain = (branchId: string): Shared => {
  if (releaseTimer) {
    window.clearTimeout(releaseTimer);
    releaseTimer = undefined;
  }
  if (!shared || shared.branchId !== branchId) {
    shared?.stop();
    shared = start(branchId);
  }
  shared.refs += 1;
  return shared;
};

const release = (s: Shared) => {
  s.refs = Math.max(0, s.refs - 1);
  if (s.refs > 0) return;
  releaseTimer = window.setTimeout(() => {
    releaseTimer = undefined;
    if (shared !== s || s.refs > 0) return;
    s.stop();
    if (shared === s) shared = null;
  }, RELEASE_MS);
};

/* Parchea el snapshot compartido. La baldosa, la campanita del header, el
 * globo de la nav y el dock derivan todos de estas mismas cuentas, así que
 * tocarlas acá los mueve a los cuatro en el mismo render.
 *
 * Los cambios de pedido ya no se pintan antes del UPDATE: si otra caja ganó,
 * festejarlo mentía. Un llamado que se apaga acá sí, porque el reload de
 * cualquiera de las dos ramas lo vuelve a encender si el servidor no lo
 * aceptó.
 *
 * No hace nada si la sucursal cambió mientras tanto. */
export const patchTableBills = (
  branchId: string,
  fn: (bills: TableBill[]) => TableBill[],
) => {
  if (!shared || shared.branchId !== branchId) return;
  shared.bills = fn(shared.bills);
  emit(shared);
};

const empty = {
  bills: [] as TableBill[],
  ready: true,
  live: false,
  syncError: null as DataError | null,
  refresh: async () => {},
};

export const useTableBills = (branchId: string | null) => {
  const live = supabaseConfigured && isRealBranchId(branchId);

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!live || !branchId) return () => {};
      const s = retain(branchId);
      s.listeners.add(onChange);
      return () => {
        s.listeners.delete(onChange);
        release(s);
      };
    },
    [live, branchId],
  );

  const version = useSyncExternalStore(
    subscribe,
    () => (shared && shared.branchId === branchId ? shared.version : 0),
    () => 0,
  );
  void version;

  if (!live || !branchId) {
    return empty;
  }

  if (!shared || shared.branchId !== branchId) {
    return {
      bills: [],
      ready: false,
      live: true,
      syncError: null,
      refresh: async () => {},
    };
  }

  return {
    bills: shared.bills,
    ready: shared.ready,
    live: shared.live,
    syncError: shared.syncError,
    refresh: shared.refresh,
  };
};
