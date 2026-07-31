import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabaseConfigured } from "@/lib/supabase/config";

import type { BusinessType } from "@/lib/types";
export type { BusinessType };
export { BUSINESS_TYPE_LABEL, BUSINESS_TYPES } from "@/lib/types";

export type IdentificationMode = "pedido" | "nombre" | "mesa";

export interface EmployeeUI {
  id: string;
  nombre: string;
  rol: string;
  tienePin: boolean;
}

export type NewEmployeeInput = {
  nombre: string;
  rol?: string;
  pin?: string;
};

interface ConfigState {
  nombre: string;
  tipo: BusinessType;
  whatsapp: string;
  direccion: string;
  modo: IdentificationMode;
  cantidadMesas: number;
  horaCorte: number;
  moduloPedidos: boolean;
  moduloEspera: boolean;
  empleados: EmployeeUI[];

  setCampo: (
    campo: "nombre" | "tipo" | "whatsapp" | "direccion",
    valor: string,
  ) => void;
  setModo: (mode: IdentificationMode) => void;
  setCantidadMesas: (n: number) => void;
  setHoraCorte: (n: number) => void;
  hydrate: (
    partial: Partial<
      Pick<
        ConfigState,
        | "nombre"
        | "tipo"
        | "whatsapp"
        | "direccion"
        | "modo"
        | "cantidadMesas"
        | "horaCorte"
        | "moduloPedidos"
        | "moduloEspera"
      >
    >,
  ) => void;
  setEmpleados: (list: EmployeeUI[]) => void;
  pushEmpleado: (emp: EmployeeUI) => void;
  agregarEmpleado: (data: NewEmployeeInput) => void;
  actualizarEmpleado: (
    id: string,
    campo: "nombre" | "rol",
    valor: string,
  ) => void;
  marcarPinEmpleado: (id: string, tienePin: boolean) => void;
  quitarEmpleado: (id: string) => void;
  branchConfigReady: boolean;
  setBranchConfigReady: (v: boolean) => void;
}

const INICIAL = supabaseConfigured
  ? {
      nombre: "",
      tipo: "otro" as BusinessType,
      whatsapp: "",
      direccion: "",
      modo: "pedido" as IdentificationMode,
      cantidadMesas: 10,
      horaCorte: 6,
      moduloPedidos: true,
      moduloEspera: false,
      empleados: [] as EmployeeUI[],
      branchConfigReady: false,
    }
  : {
      nombre: "La Esquina Centro",
      tipo: "panaderia" as BusinessType,
      whatsapp: "+54 9 341 555 1234",
      direccion: "Calle Falsa 742, Rosario",
      modo: "pedido" as IdentificationMode,
      cantidadMesas: 10,
      horaCorte: 6,
      moduloPedidos: true,
      moduloEspera: true,
      empleados: [
        { id: "emp-demo-1", nombre: "Lucía", rol: "Mozo", tienePin: false },
        { id: "emp-demo-2", nombre: "Marcos", rol: "Cocina", tienePin: false },
      ] as EmployeeUI[],
      branchConfigReady: true,
    };

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      ...INICIAL,

      setCampo: (campo, valor) => set({ [campo]: valor } as Partial<ConfigState>),
      setModo: (mode) => set({ modo: mode }),
      setCantidadMesas: (n) => set({ cantidadMesas: Math.max(1, n || 1) }),
      setHoraCorte: (n) =>
        set({ horaCorte: Math.min(23, Math.max(0, Math.floor(n) || 0)) }),
      hydrate: (partial) => set({ ...partial, branchConfigReady: true }),
      setBranchConfigReady: (v) => set({ branchConfigReady: v }),
      setEmpleados: (list) => set({ empleados: list }),
      pushEmpleado: (emp) => set((s) => ({ empleados: [...s.empleados, emp] })),

      agregarEmpleado: (data) =>
        set((s) => ({
          empleados: [
            ...s.empleados,
            {
              id: crypto.randomUUID(),
              nombre: data.nombre.trim(),
              rol: (data.rol ?? "").trim(),
              tienePin: Boolean((data.pin ?? "").trim()),
            },
          ],
        })),
      actualizarEmpleado: (id, campo, valor) =>
        set((s) => ({
          empleados: s.empleados.map((e) =>
            e.id === id ? { ...e, [campo]: valor } : e,
          ),
        })),
      marcarPinEmpleado: (id, tienePin) =>
        set((s) => ({
          empleados: s.empleados.map((e) =>
            e.id === id ? { ...e, tienePin } : e,
          ),
        })),
      quitarEmpleado: (id) =>
        set((s) => ({ empleados: s.empleados.filter((e) => e.id !== id) })),
    }),
    {
      name: "cicalino-config",
      skipHydration: true,
      partialize: (s) => {
        const operacion = {
          modo: s.modo,
          cantidadMesas: s.cantidadMesas,
          horaCorte: s.horaCorte,
          moduloPedidos: s.moduloPedidos,
          moduloEspera: s.moduloEspera,
          empleados: s.empleados,
        };
        if (supabaseConfigured) return operacion;
        return {
          ...operacion,
          nombre: s.nombre,
          tipo: s.tipo,
          whatsapp: s.whatsapp,
          direccion: s.direccion,
        };
      },
    },
  ),
);

export const modeLabel = (mode: IdentificationMode): string => {
  return mode === "mesa" ? "Mesa" : mode === "pedido" ? "Pedido" : "Cliente";
};
