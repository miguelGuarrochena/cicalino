"use client";

import { useEffect, useState } from "react";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { useSessionStore } from "@/lib/store/session-store";
import { isRealBranchId } from "@/lib/data/orders";
import { fetchMyBranches, type BranchLite } from "@/lib/data/branch";

// Sucursales de la organización del dueño (live). Además auto-selecciona la
// primera si la sucursal activa no es real (dueño con varias, sin una fijada).
export const useMyBranches = (): { branches: BranchLite[]; ready: boolean } => {
  const role = useSessionStore((s) => s.rol);
  const orgId = useSessionStore((s) => s.organizacionId);
  const branchId = useSessionStore((s) => s.sucursalId);
  const setBranchId = useSessionStore((s) => s.setSucursalId);
  const live = supabaseConfigurado;

  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!live || role !== "admin" || !isRealBranchId(orgId)) {
      setReady(true);
      return;
    }
    let active = true;
    void (async () => {
      const list = await fetchMyBranches(orgId);
      if (!active) return;
      setBranches(list);
      setReady(true);
      if (list.length && !isRealBranchId(branchId)) {
        setBranchId(list[0].id);
      }
    })();
    return () => {
      active = false;
    };
  }, [live, role, orgId, branchId, setBranchId]);

  return { branches, ready };
};
