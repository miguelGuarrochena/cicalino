import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabaseConfigurado } from "@/lib/supabase/config";

export interface ActiveEmployee {
  id: string;
  nombre: string;
}

export interface Impersonacion {
  organizacionId: string;
  organizacionNombre: string;
  sucursalId: string;
  sucursalNombre: string;
}

// Roles: dueño = org; supervisor/empleado = una sucursal; SA = Cicalino.
export type CurrentRole = "superadmin" | "admin" | "supervisor" | "empleado";

interface SessionState {
  rol: CurrentRole;
  organizacionId: string | null;
  sucursalId: string | null;
  setRol: (role: CurrentRole) => void;
  /** Dueño / supervisor: fijar contexto de empresa y sucursal activa. */
  setContexto: (orgId: string | null, branchId: string | null) => void;
  setSucursalId: (branchId: string | null) => void;
  empleadoActivo: ActiveEmployee | null;
  fichar: (emp: ActiveEmployee) => void;
  salir: () => void;
  impersonando: Impersonacion | null;
  entrarComoDueño: (data: Impersonacion) => void;
  salirImpersonacion: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      rol: "admin",
      // En producción el contexto lo fija el login; en demo, La Esquina · Centro.
      organizacionId: supabaseConfigurado ? null : "org-esquina",
      sucursalId: supabaseConfigurado ? null : "suc-centro",
      setRol: (role) =>
        set(
          supabaseConfigurado
            ? {
                rol: role,
                impersonando: null,
                // En vivo el contexto lo fija login / sync de perfil, no demos.
                ...(role === "superadmin"
                  ? { organizacionId: null, sucursalId: null }
                  : {}),
              }
            : {
                rol: role,
                impersonando: null,
                organizacionId:
                  role === "superadmin" ? null : "org-esquina",
                sucursalId: role === "superadmin" ? null : "suc-centro",
              },
        ),
      setContexto: (organizationId, branchId) =>
        set({ organizacionId: organizationId, sucursalId: branchId }),
      setSucursalId: (branchId) => set({ sucursalId: branchId }),
      empleadoActivo: null,
      fichar: (emp) => set({ empleadoActivo: emp }),
      salir: () => set({ empleadoActivo: null }),
      impersonando: null,
      entrarComoDueño: (data) =>
        set({
          rol: "admin",
          organizacionId: data.organizacionId,
          sucursalId: data.sucursalId,
          impersonando: data,
          empleadoActivo: null,
        }),
      salirImpersonacion: () =>
        set({
          rol: "superadmin",
          organizacionId: null,
          sucursalId: null,
          impersonando: null,
          empleadoActivo: null,
        }),
    }),
    { name: "cicalino-session-v2", skipHydration: true },
  ),
);

/** Limpia sesión de panel (memoria + localStorage). Solo al cerrar sesión a propósito. */
export const clearSessionLocal = () => {
  useSessionStore.setState({
    rol: "admin",
    organizacionId: supabaseConfigurado ? null : "org-esquina",
    sucursalId: supabaseConfigurado ? null : "suc-centro",
    empleadoActivo: null,
    impersonando: null,
  });
  try {
    useSessionStore.persist.clearStorage();
  } catch {
    /* sin storage */
  }
};
