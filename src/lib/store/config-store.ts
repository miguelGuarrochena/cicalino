import { create } from "zustand";
import { persist } from "zustand/middleware";

export type IdentificationMode = "pedido" | "nombre" | "mesa";
export type TipoNegocio =
  | "cafeteria"
  | "panaderia"
  | "rotiseria"
  | "heladeria"
  | "otro";

export interface EmployeeUI {
  id: string;
  nombre: string;
  rol: string;
  pin: string;
}

export type NewEmployeeInput = {
  nombre: string;
  rol?: string;
  pin?: string;
};

interface ConfigState {
  nombre: string;
  tipo: TipoNegocio;
  whatsapp: string;
  direccion: string;
  modo: IdentificationMode;
  cantidadMesas: number;
  empleados: EmployeeUI[];

  setCampo: (
    campo: "nombre" | "tipo" | "whatsapp" | "direccion",
    valor: string,
  ) => void;
  setModo: (mode: IdentificationMode) => void;
  setCantidadMesas: (n: number) => void;
  agregarEmpleado: (data: NewEmployeeInput) => void;
  actualizarEmpleado: (
    id: string,
    campo: "nombre" | "rol" | "pin",
    valor: string,
  ) => void;
  quitarEmpleado: (id: string) => void;
}

// Store de configuracion del local. Persistido en localStorage para el
// prototipo; en produccion sincroniza con la tabla `locales` + `empleados`.
export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      // Demo: config de la sucursal activa (La Esquina — Centro).
      // En producción la config vive en la tabla `locales` (una por sucursal).
      nombre: "La Esquina — Centro",
      tipo: "panaderia",
      whatsapp: "+54 9 341 555 1234",
      direccion: "Calle Falsa 742, Rosario",
      modo: "pedido",
      cantidadMesas: 10,
      empleados: [
        { id: "emp-demo-1", nombre: "Lucía", rol: "Mozo", pin: "1234" },
        { id: "emp-demo-2", nombre: "Marcos", rol: "Cocina", pin: "4321" },
      ],

      setCampo: (campo, valor) => set({ [campo]: valor } as Partial<ConfigState>),
      setModo: (mode) => set({ modo: mode }),
      setCantidadMesas: (n) => set({ cantidadMesas: Math.max(1, n || 1) }),

      agregarEmpleado: (data) =>
        set((s) => ({
          empleados: [
            ...s.empleados,
            {
              id: crypto.randomUUID(),
              nombre: data.nombre.trim(),
              rol: (data.rol ?? "").trim(),
              pin: (data.pin ?? "").replace(/\D/g, "").slice(0, 4),
            },
          ],
        })),
      actualizarEmpleado: (id, campo, valor) =>
        set((s) => ({
          empleados: s.empleados.map((e) =>
            e.id === id ? { ...e, [campo]: valor } : e,
          ),
        })),
      quitarEmpleado: (id) =>
        set((s) => ({ empleados: s.empleados.filter((e) => e.id !== id) })),
    }),
    { name: "cicalino-config", skipHydration: true },
  ),
);

// Etiqueta de la referencia segun el modo (para mostrar en panel / cliente).
export const modeLabel = (mode: IdentificationMode): string => {
  return mode === "mesa" ? "Mesa" : mode === "pedido" ? "Pedido" : "Cliente";
};
