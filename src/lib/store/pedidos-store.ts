import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EstadoPedido, PedidoVista } from "@/lib/types";
import { pedidosDemo } from "@/lib/mock";

// Store de pedidos del día (prototipo). Persistido para que el panel y
// /p/[token] compartan estado entre pestañas del mismo navegador.

interface PedidosState {
  pedidos: PedidoVista[];
  seeded: boolean;
  cargando: boolean;
  setPedidos: (pedidos: PedidoVista[]) => void;
  seedSiVacio: () => void;
  agregarPedido: (pedido: PedidoVista) => void;
  cambiarEstado: (id: string, estado: EstadoPedido) => void;
  setCargando: (cargando: boolean) => void;
}

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

export const usePedidosStore = create<PedidosState>()(
  persist(
    (set, get) => ({
      pedidos: [],
      seeded: false,
      cargando: false,

      setPedidos: (pedidos) => set({ pedidos }),

      seedSiVacio: () => {
        if (get().seeded && get().pedidos.length > 0) return;
        set({ pedidos: pedidosDemo(), seeded: true });
      },

      agregarPedido: (pedido) =>
        set((s) => ({ pedidos: [pedido, ...s.pedidos], seeded: true })),

      cambiarEstado: (id, estado) =>
        set((s) => ({
          pedidos: s.pedidos.map((p) =>
            p.id === id ? conTimestamp(p, estado) : p,
          ),
        })),

      setCargando: (cargando) => set({ cargando }),
    }),
    {
      name: "cicalino-pedidos",
      skipHydration: true,
      partialize: (s) => ({
        pedidos: s.pedidos,
        seeded: s.seeded,
      }),
    },
  ),
);

export const pedidoPorToken = (
  pedidos: PedidoVista[],
  token: string,
): PedidoVista | undefined => pedidos.find((p) => p.qrToken === token);
