import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabaseConfigured } from "@/lib/supabase/config";
import { businessDayStart } from "@/lib/businessDay";

export interface ActiveEmployee {
  id: string;
  name: string;
  /* Cuándo fichó, en epoch ms. El fichaje vence con la jornada: sin esto
   * quedaba activo para siempre y la tablet del mostrador seguía atribuyendo
   * pedidos a quien fichó tres días atrás.
   *
   * Opcional porque los fichajes que ya están guardados en localStorage no lo
   * tienen. Ver `fichajeVigente`: sin sello se considera vencido, así que esa
   * gente ficha una vez más y listo. */
  fichadoEn?: number;
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
  impersonando: Impersonation | null;
  entrarComoDueño: (data: Impersonation) => void;
  salirImpersonacion: () => void;
}

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
      fichar: (emp) =>
        set({ empleadoActivo: { ...emp, fichadoEn: emp.fichadoEn ?? Date.now() } }),
      salir: () => set({ empleadoActivo: null }),
      impersonando: null,
      entrarComoDueño: (data) =>
        set({
          rol: "admin",
          organizationId: data.organizationId,
          sucursalId: data.sucursalId,
          impersonando: data,
          empleadoActivo: null,
        }),
      salirImpersonacion: () =>
        set({
          rol: "superadmin",
          organizationId: null,
          sucursalId: null,
          impersonando: null,
          empleadoActivo: null,
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
      }),
    },
  ),
);

/* ¿El fichaje sigue siendo de esta jornada?
 *
 * Se ancla al corte del día del local, que es la unidad con la que el local
 * piensa: el turno de la noche sigue siendo "hoy" hasta las 6, y a las 6
 * arranca otro.
 *
 * No borra nada del historial: `pedidos.empleado_id` y `esperas.empleado_id`
 * quedan como estaban. Lo único que caduca es a quién se le atribuyen los
 * pedidos NUEVOS en este dispositivo. */
export const fichajeVigente = (
  emp: ActiveEmployee | null,
  cutoffHour: number,
  ahora: Date = new Date(),
): boolean => {
  if (!emp) return false;
  if (typeof emp.fichadoEn !== "number" || !Number.isFinite(emp.fichadoEn)) {
    return false;
  }
  return emp.fichadoEn >= businessDayStart(cutoffHour, ahora).getTime();
};

export const clearSessionLocal = () => {
  useSessionStore.setState({
    rol: "admin",
    organizationId: supabaseConfigured ? null : "org-esquina",
    sucursalId: supabaseConfigured ? null : "suc-centro",
    empleadoActivo: null,
    impersonando: null,
  });
  try {
    useSessionStore.persist.clearStorage();
  } catch {
  }
};
