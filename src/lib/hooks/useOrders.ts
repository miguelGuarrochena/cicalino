"use client";

import { useCallback, useEffect, useState } from "react";
import { useOrdersStore } from "@/lib/store/orders-store";
import { supabaseConfigurado } from "@/lib/supabase/config";
import {
  isRealBranchId,
  fetchTodayOrders,
  fetchBranchName,
  insertOrder,
  updateOrderStatus,
  subscribeOrders,
} from "@/lib/data/orders";
import type { OrderStatus, OrderView } from "@/lib/types";

type EmployeeRef = { id: string; nombre: string } | null;

export interface UseOrders {
  orders: OrderView[];
  ready: boolean;
  live: boolean;
  branchName: string | null;
  createOrder: (
    reference: string,
    employee?: EmployeeRef,
  ) => Promise<OrderView | null>;
  changeStatus: (id: string, status: OrderStatus) => Promise<void>;
}

// Fuente de pedidos del panel: con Supabase + sucursal real usa la base y
// realtime (sync multi-caja); si no, cae al store demo (Zustand).
export const useOrders = (branchId: string | null): UseOrders => {
  const live = supabaseConfigurado && isRealBranchId(branchId);

  const demoOrders = useOrdersStore((s) => s.pedidos);
  const seed = useOrdersStore((s) => s.seedSiVacio);
  const demoAdd = useOrdersStore((s) => s.agregarPedido);
  const demoChange = useOrdersStore((s) => s.cambiarEstado);

  const [liveOrders, setLiveOrders] = useState<OrderView[]>([]);
  const [branchName, setBranchName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (!live || !branchId) return;
    setLiveOrders(await fetchTodayOrders(branchId));
    setReady(true);
  }, [live, branchId]);

  useEffect(() => {
    if (!live || !branchId) {
      seed();
      setReady(true);
      return;
    }
    setReady(false);
    reload();
    fetchBranchName(branchId).then(setBranchName);
    const unsub = subscribeOrders(branchId, reload);
    return unsub;
  }, [live, branchId, seed, reload]);

  const createOrder = useCallback<UseOrders["createOrder"]>(
    async (reference, employee) => {
      if (!live || !branchId) {
        const o: OrderView = {
          id: crypto.randomUUID(),
          referencia: reference,
          estado: "creado",
          creadoEn: new Date().toISOString(),
          enPreparacionEn: null,
          listoEn: null,
          retiradoEn: null,
          canceladoEn: null,
          qrToken: crypto.randomUUID(),
          empleado: employee?.nombre ?? null,
        };
        demoAdd(o);
        return o;
      }
      // Empleados aún no están en la base: solo mando id si es UUID real.
      const employeeId =
        employee && isRealBranchId(employee.id) ? employee.id : null;
      const created = await insertOrder({ branchId, reference, employeeId });
      if (created) {
        setLiveOrders((cur) => [
          created,
          ...cur.filter((o) => o.id !== created.id),
        ]);
      }
      return created;
    },
    [live, branchId, demoAdd],
  );

  const changeStatus = useCallback<UseOrders["changeStatus"]>(
    async (id, status) => {
      if (!live) {
        demoChange(id, status);
        return;
      }
      setLiveOrders((cur) =>
        cur.map((o) => (o.id === id ? { ...o, estado: status } : o)),
      );
      await updateOrderStatus(id, status);
      if (status === "listo") {
        // Aviso Web Push al cliente (best-effort; requiere VAPID configurado).
        void fetch("/api/push/notify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderId: id }),
        }).catch(() => {});
      }
    },
    [live, demoChange],
  );

  return {
    orders: live ? liveOrders : demoOrders,
    ready,
    live,
    branchName,
    createOrder,
    changeStatus,
  };
};
