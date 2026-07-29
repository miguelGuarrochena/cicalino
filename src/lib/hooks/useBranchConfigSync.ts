"use client";

import { useEffect } from "react";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { useConfigStore } from "@/lib/store/config-store";
import { isRealBranchId } from "@/lib/data/orders";
import { fetchBranchConfig, fetchEmployees } from "@/lib/data/branch";

// Con Supabase + sucursal real, carga la config y los empleados de la base
// dentro de la config-store (que sigue siendo la fuente que lee la UI).
export const useBranchConfigSync = (branchId: string | null): void => {
  const hydrate = useConfigStore((s) => s.hydrate);
  const setEmpleados = useConfigStore((s) => s.setEmpleados);
  const setBranchConfigReady = useConfigStore((s) => s.setBranchConfigReady);
  const live = supabaseConfigurado && isRealBranchId(branchId);

  useEffect(() => {
    if (!live || !branchId) {
      setBranchConfigReady(true);
      return;
    }
    let active = true;
    setBranchConfigReady(false);
    void (async () => {
      const cfg = await fetchBranchConfig(branchId);
      if (!active) return;
      if (cfg) hydrate(cfg);
      else setBranchConfigReady(true);
      const emps = await fetchEmployees(branchId);
      if (active) setEmpleados(emps);
    })();
    return () => {
      active = false;
    };
  }, [live, branchId, hydrate, setEmpleados, setBranchConfigReady]);
};
