import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabaseConfigured } from "@/lib/supabase/config";

export interface ActiveEmployee {
  id: string;
  name: string;
}

export interface Impersonation {
  organizationId: string;
  organizationName: string;
  sucursalId: string;
  branchName: string;
}

export type CurrentRole = "superadmin" | "admin" | "supervisor" | "empleado";

interface SessionState {
  rol: CurrentRole;
  organizationId: string | null;
  sucursalId: string | null;
  setRol: (role: CurrentRole) => void;
  setContexto: (orgId: string | null, branchId: string | null) => void;
  setSucursalId: (branchId: string | null) => void;
  empleadoActivo: ActiveEmployee | null;
  fichar: (emp: ActiveEmployee) => void;
  salir: () => void;
  adminDesbloqueado: boolean;
  adminDesbloqueadoHasta: number | null;
  desbloquearAdmin: () => void;
  bloquearAdmin: () => void;
  impersonando: Impersonation | null;
  entrarComoDueño: (data: Impersonation) => void;
  salirImpersonacion: () => void;
}

export const ADMIN_UNLOCK_MS = 15 * 60_000;

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      rol: "admin",
      organizationId: supabaseConfigured ? null : "org-esquina",
      sucursalId: supabaseConfigured ? null : "suc-centro",
      setRol: (role) =>
        set(
          supabaseConfigured
            ? {
                rol: role,
                impersonando: null,
                ...(role === "superadmin"
                  ? { organizationId: null, sucursalId: null }
                  : {}),
              }
            : {
                rol: role,
                impersonando: null,
                organizationId:
                  role === "superadmin" ? null : "org-esquina",
                sucursalId: role === "superadmin" ? null : "suc-centro",
              },
        ),
      setContexto: (organizationId, branchId) =>
        set({ organizationId: organizationId, sucursalId: branchId }),
      setSucursalId: (branchId) => set({ sucursalId: branchId }),
      empleadoActivo: null,
      fichar: (emp) => set({ empleadoActivo: emp }),
      salir: () => set({ empleadoActivo: null }),
      adminDesbloqueado: false,
      adminDesbloqueadoHasta: null,
      desbloquearAdmin: () =>
        set({
          adminDesbloqueado: true,
          adminDesbloqueadoHasta: Date.now() + ADMIN_UNLOCK_MS,
        }),
      bloquearAdmin: () =>
        set({ adminDesbloqueado: false, adminDesbloqueadoHasta: null }),
      impersonando: null,
      entrarComoDueño: (data) =>
        set({
          rol: "admin",
          organizationId: data.organizationId,
          sucursalId: data.sucursalId,
          impersonando: data,
          empleadoActivo: null,
          adminDesbloqueado: false,
        }),
      salirImpersonacion: () =>
        set({
          rol: "superadmin",
          organizationId: null,
          sucursalId: null,
          impersonando: null,
          empleadoActivo: null,
          adminDesbloqueado: false,
          adminDesbloqueadoHasta: null,
        }),
    }),
    {
      name: "cicalino-session-v2",
      skipHydration: true,
      partialize: (s) => ({
        rol: s.rol,
        organizationId: s.organizationId,
        sucursalId: s.sucursalId,
        empleadoActivo: s.empleadoActivo,
        impersonando: s.impersonando,
        adminDesbloqueadoHasta: s.adminDesbloqueadoHasta,
      }),
    },
  ),
);

export const clearSessionLocal = () => {
  useSessionStore.setState({
    rol: "admin",
    organizationId: supabaseConfigured ? null : "org-esquina",
    sucursalId: supabaseConfigured ? null : "suc-centro",
    empleadoActivo: null,
    impersonando: null,
    adminDesbloqueado: false,
    adminDesbloqueadoHasta: null,
  });
  try {
    useSessionStore.persist.clearStorage();
  } catch {
  }
};
