import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OrderStatus, OrderView } from "@/lib/types";
import { ordersDemo } from "@/lib/mock";

// Store de pedidos del día (prototipo). Persistido para que el panel y
// /p/[token] compartan estado entre pestañas del mismo navegador.

interface OrdersState {
  pedidos: OrderView[];
  seeded: boolean;
  cargando: boolean;
  setPedidos: (orders: OrderView[]) => void;
  seedSiVacio: () => void;
  agregarPedido: (order: OrderView) => void;
  cambiarEstado: (id: string, status: OrderStatus) => void;
  setCargando: (cargando: boolean) => void;
}

const conTimestamp = (p: OrderView, status: OrderStatus): OrderView => {
  const ahora = new Date().toISOString();
  return {
    ...p,
    estado: status,
    enPreparacionEn:
      status === "en_preparacion" ? ahora : p.enPreparacionEn,
    listoEn: status === "listo" ? ahora : p.listoEn,
    retiradoEn: status === "retirado" ? ahora : p.retiradoEn,
    canceladoEn: status === "cancelado" ? ahora : p.canceladoEn,
  };
};

export const useOrdersStore = create<OrdersState>()(
  persist(
    (set, get) => ({
      pedidos: [],
      seeded: false,
      cargando: false,

      setPedidos: (orders) => set({ pedidos: orders }),

      seedSiVacio: () => {
        if (get().seeded && get().pedidos.length > 0) return;
        set({ pedidos: ordersDemo(), seeded: true });
      },

      agregarPedido: (order) =>
        set((s) => ({ pedidos: [order, ...s.pedidos], seeded: true })),

      cambiarEstado: (id, status) =>
        set((s) => ({
          pedidos: s.pedidos.map((p) =>
            p.id === id ? conTimestamp(p, status) : p,
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

export const orderByToken = (
  orders: OrderView[],
  token: string,
): OrderView | undefined => orders.find((p) => p.qrToken === token);
