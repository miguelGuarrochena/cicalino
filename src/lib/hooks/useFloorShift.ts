"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseConfigured } from "@/lib/supabase/config";
import { isRealBranchId } from "@/lib/data/orders";
import { coalesced } from "@/lib/realtime";
import type { DataError } from "@/lib/data/result";
import { fetchFloorShift, subscribeFloorShift } from "@/lib/data/floorShift";
import type { ShiftDay } from "@/lib/floorShift";

const EMPTY: ShiftDay = { date: "", weekday: 1, assignments: [], template: [] };
const RESPALDO_MS = 20_000;

export const useFloorShift = (branchId: string | null, enabled: boolean) => {
  const live = enabled && supabaseConfigured && isRealBranchId(branchId);
  const [shift, setShift] = useState<ShiftDay>(EMPTY);
  const [ready, setReady] = useState(!live);
  const [syncError, setSyncError] = useState<DataError | null>(null);

  const reload = useMemo(
    () =>
      coalesced(async () => {
        if (!branchId || !live) return;
        const res = await fetchFloorShift(branchId);
        if (res.ok) {
          setShift(res.data);
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
    const sub = subscribeFloorShift(branchId, () => void reload());
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

  return { shift, ready, live, syncError, refresh };
};
