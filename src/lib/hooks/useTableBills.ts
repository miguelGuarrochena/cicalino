"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseConfigured } from "@/lib/supabase/config";
import { isRealBranchId } from "@/lib/data/orders";
import { fetchTableBills, subscribeTableBills } from "@/lib/data/tables";
import { coalesced } from "@/lib/realtime";
import type { DataError } from "@/lib/data/result";
import type { TableBill } from "@/lib/tableBill";

/* Poll interval while realtime is down. With it healthy, changes arrive by
 * mesa_sesiones and this only runs as a safety net. */
const RESPALDO_MS = 15_000;

export const useTableBills = (branchId: string | null) => {
  const live = supabaseConfigured && isRealBranchId(branchId);
  const [bills, setBills] = useState<TableBill[]>([]);
  const [ready, setReady] = useState(!live);
  const [syncError, setSyncError] = useState<DataError | null>(null);

  const reload = useMemo(
    () =>
      coalesced(async () => {
        if (!branchId || !live) return;
        const res = await fetchTableBills(branchId);
        if (res.ok) {
          setBills(res.data);
          setSyncError(null);
        } else {
          setSyncError(res.error);
        }
        setReady(true);
      }),
    [branchId, live],
  );

  useEffect(() => {
    if (!live || !branchId) return;
    void reload();
    const sub = subscribeTableBills(branchId, () => void reload());
    const id = window.setInterval(() => {
      if (!sub.isHealthy() && document.visibilityState === "visible") void reload();
    }, RESPALDO_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      sub.unsubscribe();
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [live, branchId, reload]);

  const refresh = useCallback(() => reload(), [reload]);

  return { bills, ready, live, syncError, refresh };
};
