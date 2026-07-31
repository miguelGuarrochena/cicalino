"use client";

import { useApp } from "@/components/providers/Providers";
import { Select } from "@/components/ui/Select";
import { useSessionStore } from "@/lib/store/session-store";
import { orgById, useSuperadminStore } from "@/lib/store/superadmin-store";
import { supabaseConfigured } from "@/lib/supabase/config";
import { useMyBranches } from "@/lib/hooks/useMyBranches";

export const BranchSwitcher = () => {
  const { t } = useApp();
  const role = useSessionStore((s) => s.rol);
  const organizationId = useSessionStore((s) => s.organizacionId);
  const branchId = useSessionStore((s) => s.sucursalId);
  const setBranchId = useSessionStore((s) => s.setSucursalId);
  const orgs = useSuperadminStore((s) => s.organizaciones);
  const { branches: liveBranches } = useMyBranches();

  if (role !== "admin") return null;

  let options: { id: string; nombre: string }[];
  if (supabaseConfigured) {
    options = liveBranches;
  } else {
    const org = orgById(orgs, organizationId);
    options = org
      ? org.sucursales.filter((s) => s.activo).map((s) => ({
          id: s.id,
          nombre: s.nombre,
        }))
      : [];
  }

  if (options.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-carbon/40 sm:inline">
        {t("sucursal.label")}
      </span>
      <Select
        variant="pill"
        ariaLabel={t("sucursal.label")}
        value={branchId ?? ""}
        onChange={(v) => setBranchId(v || null)}
        options={options.map((s) => ({ value: s.id, label: s.nombre }))}
      />
    </div>
  );
};
