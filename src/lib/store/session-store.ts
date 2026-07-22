import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface EmpleadoActivo {
  id: string;
  nombre: string;
}

export interface Impersonacion {
  localId: string;
  localNombre: string;
}

// Roles operativos. superadmin vive en /admin; admin/supervisor/empleado en /panel.
export type RolActual = "superadmin" | "admin" | "supervisor" | "empleado";

interface SessionState {
  rol: RolActual;
  setRol: (rol: RolActual) => void;
  empleadoActivo: EmpleadoActivo | null;
  fichar: (emp: EmpleadoActivo) => void;
  salir: () => void;
  impersonando: Impersonacion | null;
  entrarComoDueño: (local: Impersonacion) => void;
  salirImpersonacion: () => void;
}

// Sesión del dispositivo del local. Mozo/caja opera los estados del pedido;
// el empleado ficha con PIN para registrar quién atendió.
export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      rol: "admin",
      setRol: (rol) => set({ rol, impersonando: null }),
      empleadoActivo: null,
      fichar: (emp) => set({ empleadoActivo: emp }),
      salir: () => set({ empleadoActivo: null }),
      impersonando: null,
      entrarComoDueño: (local) =>
        set({
          rol: "admin",
          impersonando: local,
          empleadoActivo: null,
        }),
      salirImpersonacion: () =>
        set({
          rol: "superadmin",
          impersonando: null,
          empleadoActivo: null,
        }),
    }),
    { name: "cicalino-session", skipHydration: true },
  ),
);
