import { create } from "zustand";
import type { EstadoPedido, PedidoVista } from "@/lib/types";

// Store de Zustand para el panel del local: mantiene la lista de pedidos
// del dia en memoria del cliente y expone acciones para mutarla de forma
// optimista (la fuente de verdad sigue siendo la base via API).

interface PedidosState {
  pedidos: PedidoVista[];
  cargando: boolean;
  // acciones
  setPedidos: (pedidos: PedidoVista[]) => void;
  agregarPedido: (pedido: PedidoVista) => void;
  cambiarEstado: (id: string, estado: EstadoPedido) => void;
  setCargando: (cargando: boolean) => void;
}

// Marca el timestamp correspondiente al nuevo estado (update optimista local).
const conTimestamp = (p: PedidoVista, estado: EstadoPedido): PedidoVista => {
  const ahora = new Date().toISOString();
  return {
    ...p,
    estado,
    enPreparacionEn:
      estado === "en_preparacion" ? ahora : p.enPreparacionEn,
    listoEn: estado === "listo" ? ahora : p.listoEn,
    retiradoEn: estado === "retirado" ? ahora : p.retiradoEn,
    canceladoEn: estado === "cancelado" ? ahora : p.canceladoEn,
  };
};

export const usePedidosStore = create<PedidosState>((set) => ({
  pedidos: [],
  cargando: false,

  setPedidos: (pedidos) => set({ pedidos }),

  agregarPedido: (pedido) =>
    set((s) => ({ pedidos: [pedido, ...s.pedidos] })),

  cambiarEstado: (id, estado) =>
    set((s) => ({
      pedidos: s.pedidos.map((p) =>
        p.id === id ? conTimestamp(p, estado) : p,
      ),
    })),

  setCargando: (cargando) => set({ cargando }),
}));
