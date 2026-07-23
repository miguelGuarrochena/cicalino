import { create } from "zustand";
import { persist } from "zustand/middleware";

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
      // Demo: dueño de La Esquina, sucursal Centro
      organizacionId: "org-esquina",
      sucursalId: "suc-centro",
      setRol: (role) =>
        set({
          rol: role,
          impersonando: null,
          // Defaults demo al cambiar rol
          organizacionId:
            role === "superadmin" ? null : "org-esquina",
          sucursalId:
            role === "superadmin"
              ? null
              : role === "admin"
                ? "suc-centro"
                : "suc-centro",
        }),
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
