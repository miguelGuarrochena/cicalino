import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabaseConfigured } from "@/lib/supabase/config";

import type { BusinessType } from "@/lib/types";
export type { BusinessType };
export { BUSINESS_TYPE_LABEL, BUSINESS_TYPES } from "@/lib/types";

export type IdentificationMode = "pedido" | "nombre" | "mesa";

export interface EmployeeUI {
  id: string;
  name: string;
  rol: string;
  tienePin: boolean;
}

export type NewEmployeeInput = {
  name: string;
  rol?: string;
  pin?: string;
};

interface ConfigState {
  name: string;
  tipo: BusinessType;
  whatsapp: string;
  direccion: string;
  modo: IdentificationMode;
  tableCount: number;
  cutoffHour: number;
  moduloPedidos: boolean;
  moduloEspera: boolean;
  employees: EmployeeUI[];

  setCampo: (
    campo: "name" | "tipo" | "whatsapp" | "direccion",
    valor: string,
  ) => void;
  setModo: (mode: IdentificationMode) => void;
  setCantidadMesas: (n: number) => void;
  setHoraCorte: (n: number) => void;
  hydrate: (
    partial: Partial<
      Pick<
        ConfigState,
        | "name"
        | "tipo"
        | "whatsapp"
        | "direccion"
        | "modo"
        | "tableCount"
        | "cutoffHour"
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
    campo: "name" | "rol",
    valor: string,
  ) => void;
  marcarPinEmpleado: (id: string, tienePin: boolean) => void;
  quitarEmpleado: (id: string) => void;
  branchConfigReady: boolean;
  setBranchConfigReady: (v: boolean) => void;
}

const INICIAL = supabaseConfigured
  ? {
      name: "",
      tipo: "otro" as BusinessType,
      whatsapp: "",
      direccion: "",
      modo: "pedido" as IdentificationMode,
      tableCount: 10,
      cutoffHour: 6,
      moduloPedidos: true,
      moduloEspera: false,
      employees: [] as EmployeeUI[],
      branchConfigReady: false,
    }
  : {
      name: "La Esquina Centro",
      tipo: "panaderia" as BusinessType,
      whatsapp: "+54 9 341 555 1234",
      direccion: "Calle Falsa 742, Rosario",
      modo: "pedido" as IdentificationMode,
      tableCount: 10,
      cutoffHour: 6,
      moduloPedidos: true,
      moduloEspera: true,
      employees: [
        { id: "emp-demo-1", name: "Lucía", rol: "Mozo", tienePin: false },
        { id: "emp-demo-2", name: "Marcos", rol: "Cocina", tienePin: false },
      ] as EmployeeUI[],
      branchConfigReady: true,
    };

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      ...INICIAL,

      setCampo: (campo, valor) => set({ [campo]: valor } as Partial<ConfigState>),
      setModo: (mode) => set({ modo: mode }),
      setCantidadMesas: (n) => set({ tableCount: Math.max(1, n || 1) }),
      setHoraCorte: (n) =>
        set({ cutoffHour: Math.min(23, Math.max(0, Math.floor(n) || 0)) }),
      hydrate: (partial) => set({ ...partial, branchConfigReady: true }),
      setBranchConfigReady: (v) => set({ branchConfigReady: v }),
      setEmpleados: (list) => set({ employees: list }),
      pushEmpleado: (emp) => set((s) => ({ employees: [...s.employees, emp] })),

      agregarEmpleado: (data) =>
        set((s) => ({
          employees: [
            ...s.employees,
            {
              id: crypto.randomUUID(),
              name: data.name.trim(),
              rol: (data.rol ?? "").trim(),
              tienePin: Boolean((data.pin ?? "").trim()),
            },
          ],
        })),
      actualizarEmpleado: (id, campo, valor) =>
        set((s) => ({
          employees: s.employees.map((e) =>
            e.id === id ? { ...e, [campo]: valor } : e,
          ),
        })),
      marcarPinEmpleado: (id, tienePin) =>
        set((s) => ({
          employees: s.employees.map((e) =>
            e.id === id ? { ...e, tienePin } : e,
          ),
        })),
      quitarEmpleado: (id) =>
        set((s) => ({ employees: s.employees.filter((e) => e.id !== id) })),
    }),
    {
      name: "cicalino-config",
      skipHydration: true,
      partialize: (s) => {
        const operacion = {
          modo: s.modo,
          tableCount: s.tableCount,
          cutoffHour: s.cutoffHour,
          moduloPedidos: s.moduloPedidos,
          moduloEspera: s.moduloEspera,
          employees: s.employees,
        };
        if (supabaseConfigured) return operacion;
        return {
          ...operacion,
          name: s.name,
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
