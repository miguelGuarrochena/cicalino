"use client";

import { useCallback, useSyncExternalStore } from "react";
import { supabaseConfigured } from "@/lib/supabase/config";
import { isRealBranchId } from "@/lib/data/orders";
import { fetchTableBills, subscribeTableBills } from "@/lib/data/tables";
import { coalesced } from "@/lib/realtime";
import type { DataError } from "@/lib/data/result";
import type { TableBill } from "@/lib/tableBill";

/* One live subscription per branch. The header needs the same bills as
 * Mesas, and two `table-bills-${id}` channels would fight each other. */

const RESPALDO_MS = 15_000;
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
    } else {
      shared.syncError = res.error;
    }
    shared.ready = true;
    emit(shared);
  });

  const sub = subscribeTableBills(branchId, () => void reload());
  const tick = window.setInterval(() => {
    if (!sub.isHealthy() && document.visibilityState === "visible") void reload();
  }, RESPALDO_MS);
  const onVisible = () => {
    if (document.visibilityState === "visible") void reload();
  };
  document.addEventListener("visibilitychange", onVisible);
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
      sub.unsubscribe();
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
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
