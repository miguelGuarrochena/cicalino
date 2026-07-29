import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabaseConfigurado } from "@/lib/supabase/config";

import type { TipoNegocio } from "@/lib/types";
export type { TipoNegocio };
export { TIPO_NEGOCIO_LABEL, TIPOS_NEGOCIO } from "@/lib/types";

export type IdentificationMode = "pedido" | "nombre" | "mesa";

export interface EmployeeUI {
  id: string;
  nombre: string;
  rol: string;
  /**
   * Solo indica SI tiene PIN configurado. El PIN en sí nunca baja al navegador:
   * se define y se verifica en el servidor (ver security-fixes-03.sql).
   */
  tienePin: boolean;
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
  horaCorte: number;
  /** Módulos contratados en esta sucursal (solo lectura en config). */
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
  /** Sobrescribe varios campos de config de una (al cargar desde la base). */
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
  /** Reemplaza la lista de empleados (al cargar desde la base). */
  setEmpleados: (list: EmployeeUI[]) => void;
  /** Agrega un empleado ya formado (con id real de la base). */
  pushEmpleado: (emp: EmployeeUI) => void;
  agregarEmpleado: (data: NewEmployeeInput) => void;
  actualizarEmpleado: (
    id: string,
    campo: "nombre" | "rol",
    valor: string,
  ) => void;
  quitarEmpleado: (id: string) => void;
  /**
   * true cuando ya cargamos config de la sucursal (o no hace falta).
   * Evita que /panel/espera redirija a pedidos antes del fetch.
   */
  branchConfigReady: boolean;
  setBranchConfigReady: (v: boolean) => void;
}

// Store de configuracion del local. Persistido en localStorage para el
// prototipo; en produccion sincroniza con la tabla `locales` + `empleados`.
// Estado inicial. En producción (Supabase) arranca vacío y se hidrata desde la
// base (tabla `locales` + `empleados`); en demo trae datos de ejemplo.
const INICIAL = supabaseConfigurado
  ? {
      nombre: "",
      tipo: "otro" as TipoNegocio,
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
      nombre: "La Esquina — Centro",
      tipo: "panaderia" as TipoNegocio,
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
              // Modo demo (sin Supabase): no guardamos PINs en el navegador.
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
      quitarEmpleado: (id) =>
        set((s) => ({ empleados: s.empleados.filter((e) => e.id !== id) })),
    }),
    {
      name: "cicalino-config",
      skipHydration: true,
      partialize: (s) => ({
        nombre: s.nombre,
        tipo: s.tipo,
        whatsapp: s.whatsapp,
        direccion: s.direccion,
        modo: s.modo,
        cantidadMesas: s.cantidadMesas,
        horaCorte: s.horaCorte,
        moduloPedidos: s.moduloPedidos,
        moduloEspera: s.moduloEspera,
        empleados: s.empleados,
      }),
    },
  ),
);

// Etiqueta de la referencia segun el modo (para mostrar en panel / cliente).
export const modeLabel = (mode: IdentificationMode): string => {
  return mode === "mesa" ? "Mesa" : mode === "pedido" ? "Pedido" : "Cliente";
};
