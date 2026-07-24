"use client";

import { useApp } from "@/components/providers/Providers";
import { useSessionStore } from "@/lib/store/session-store";
import { orgById, useSuperadminStore } from "@/lib/store/superadmin-store";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { useMyBranches } from "@/lib/hooks/useMyBranches";

/** Switcher de sucursal para el dueño (y SA impersonando). */
export const BranchSwitcher = () => {
  const { t } = useApp();
  const role = useSessionStore((s) => s.rol);
  const organizationId = useSessionStore((s) => s.organizacionId);
  const branchId = useSessionStore((s) => s.sucursalId);
  const setBranchId = useSessionStore((s) => s.setSucursalId);
  const orgs = useSuperadminStore((s) => s.organizaciones);
  // Live: trae sucursales de la base + auto-selecciona la primera si hace falta.
  const { branches: liveBranches } = useMyBranches();

  if (role !== "admin") return null;

  let options: { id: string; nombre: string }[];
  if (supabaseConfigurado) {
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
    <label className="flex items-center gap-2">
      <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-carbon/40 sm:inline">
        {t("sucursal.label")}
      </span>
      <select
        value={branchId ?? ""}
        onChange={(e) => setBranchId(e.target.value || null)}
        className="max-w-[10rem] truncate rounded-full border border-linea bg-surface px-3 py-1.5 text-xs font-semibold text-carbon outline-none focus:border-marca sm:max-w-[14rem]"
        aria-label={t("sucursal.label")}
      >
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </select>
    </label>
  );
};
