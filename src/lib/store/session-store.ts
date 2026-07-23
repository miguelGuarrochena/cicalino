import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface EmpleadoActivo {
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
export type RolActual = "superadmin" | "admin" | "supervisor" | "empleado";

interface SessionState {
  rol: RolActual;
  organizacionId: string | null;
  sucursalId: string | null;
  setRol: (rol: RolActual) => void;
  /** Dueño / supervisor: fijar contexto de empresa y sucursal activa. */
  setContexto: (orgId: string | null, sucursalId: string | null) => void;
  setSucursalId: (sucursalId: string | null) => void;
  empleadoActivo: EmpleadoActivo | null;
  fichar: (emp: EmpleadoActivo) => void;
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
      setRol: (rol) =>
        set({
          rol,
          impersonando: null,
          // Defaults demo al cambiar rol
          organizacionId:
            rol === "superadmin" ? null : "org-esquina",
          sucursalId:
            rol === "superadmin"
              ? null
              : rol === "admin"
                ? "suc-centro"
                : "suc-centro",
        }),
      setContexto: (organizacionId, sucursalId) =>
        set({ organizacionId, sucursalId }),
      setSucursalId: (sucursalId) => set({ sucursalId }),
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
