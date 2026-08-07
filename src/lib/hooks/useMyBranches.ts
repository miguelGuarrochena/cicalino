"use client";

import { useEffect, useState } from "react";
import { supabaseConfigured } from "@/lib/supabase/config";
import { useSessionStore } from "@/lib/store/session-store";
import { isRealBranchId } from "@/lib/data/orders";
import { fetchMyBranches, type BranchLite } from "@/lib/data/branch";

export const useMyBranches = (): { branches: BranchLite[]; ready: boolean } => {
  const role = useSessionStore((s) => s.rol);
  const orgId = useSessionStore((s) => s.organizationId);
  const branchId = useSessionStore((s) => s.sucursalId);
  const setBranchId = useSessionStore((s) => s.setSucursalId);
  const live = supabaseConfigured;

  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [cargado, setCargado] = useState(false);

  const puedeElegir = role === "admin" || role === "supervisor";
  const vaABuscar = live && puedeElegir && isRealBranchId(orgId);

  /* `ready` se deriva en vez de guardarse. Antes había un `setReady(true)`
   * sincrónico en la rama que no busca nada, que es un render de más para
   * decir algo que ya se sabe sin mirar el estado: si no vamos a buscar,
   * estamos listos. */
  const ready = !vaABuscar || cargado;

  useEffect(() => {
    if (!vaABuscar) return;
    let active = true;
    void (async () => {
      const list = await fetchMyBranches(orgId);
      if (!active) return;
      setBranches(list);
      setCargado(true);
      if (list.length && !isRealBranchId(branchId)) {
        setBranchId(list[0].id);
      }
    })();
    return () => {
      active = false;
    };
  }, [vaABuscar, orgId, branchId, setBranchId]);

  return { branches, ready };
};
