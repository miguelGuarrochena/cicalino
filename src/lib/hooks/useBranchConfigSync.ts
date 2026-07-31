"use client";

import { useEffect } from "react";
import { supabaseConfigured } from "@/lib/supabase/config";
import { useConfigStore } from "@/lib/store/config-store";
import { isRealBranchId } from "@/lib/data/orders";
import { fetchBranchConfig, fetchEmployees } from "@/lib/data/branch";

export const useBranchConfigSync = (branchId: string | null): void => {
  const hydrate = useConfigStore((s) => s.hydrate);
  const setEmpleados = useConfigStore((s) => s.setEmpleados);
  const setBranchConfigReady = useConfigStore((s) => s.setBranchConfigReady);
  const live = supabaseConfigured && isRealBranchId(branchId);

  useEffect(() => {
    if (!live || !branchId) {
      setBranchConfigReady(true);
      return;
    }
    let active = true;
    setBranchConfigReady(false);
    void (async () => {
      const [cfg, emps] = await Promise.all([
        fetchBranchConfig(branchId),
        fetchEmployees(branchId),
      ]);
      if (!active) return;
      if (cfg) hydrate(cfg);
      else setBranchConfigReady(true);
      setEmpleados(emps);
    })();
    return () => {
      active = false;
    };
  }, [live, branchId, hydrate, setEmpleados, setBranchConfigReady]);
};
