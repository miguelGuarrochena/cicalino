"use client";

import { useCallback, useEffect, useState } from "react";
import { useOrdersStore } from "@/lib/store/orders-store";
import { supabaseConfigured } from "@/lib/supabase/config";
import {
  isRealBranchId,
  fetchOrdersPage,
  fetchBranchName,
  insertOrder,
  updateOrderStatus,
  subscribeOrders,
} from "@/lib/data/orders";
import type { DataError } from "@/lib/data/result";
import type { OrdersFiltro, OrdersPage } from "@/lib/data/orders";
import type { OrderStatus, OrderView } from "@/lib/types";
import { notifyCustomer, type NotifyResult } from "@/lib/notify";

type EmployeeRef = { id: string; name: string } | null;

export interface UseOrdersQuery {
  filtro: OrdersFiltro;
  busqueda: string;
  pagina: number;
  tam: number;
}

export interface UseOrders {
  /* Solo la página visible. En modo demo, la lista entera. */
  orders: OrderView[];
  /* Cuántos matchean el filtro y la búsqueda, para el paginador. */
  total: number;
  conteos: OrdersPage["conteos"];
  proximoNumero: number;
  ready: boolean;
  live: boolean;
  branchName: string | null;
  /* Set when the last refresh failed. The list keeps whatever it had: losing
   * the screen mid-service because one poll timed out would be worse than
   * showing slightly stale orders with a warning on top. */
  syncError: DataError | null;
  createOrder: (
    reference: string | null,
    employee?: EmployeeRef,
  ) => Promise<OrderView | null>;
  changeStatus: (
    id: string,
    status: OrderStatus,
  ) => Promise<NotifyResult | null>;
}

const CONTEOS_VACIOS: OrdersPage["conteos"] = {
  todos: 0,
  creado: 0,
  listo: 0,
  retirado: 0,
  cancelado: 0,
};

export const useOrders = (
  branchId: string | null,
  query: UseOrdersQuery,
): UseOrders => {
  const live = supabaseConfigured && isRealBranchId(branchId);

  const demoOrders = useOrdersStore((s) => s.pedidos);
  const seed = useOrdersStore((s) => s.seedSiVacio);
  const demoAdd = useOrdersStore((s) => s.agregarPedido);
  const demoChange = useOrdersStore((s) => s.cambiarEstado);

  const [liveOrders, setLiveOrders] = useState<OrderView[]>([]);
  const [total, setTotal] = useState(0);
  const [conteos, setConteos] = useState(CONTEOS_VACIOS);
  const [proximoNumero, setProximoNumero] = useState(1);
  const [branchName, setBranchName] = useState<string | null>(null);
  /* Solo cuenta cuando hay algo que traer. En demo no se busca nada, así que
   * `ready` se deriva y no hace falta un setState sincrónico en el efecto. */
  const [cargado, setCargado] = useState(false);
  const ready = !live || cargado;
  const [syncError, setSyncError] = useState<DataError | null>(null);

  const { filtro, busqueda, pagina, tam } = query;

  const reload = useCallback(async () => {
    if (!live || !branchId) return;
    const res = await fetchOrdersPage(branchId, {
      filtro,
      busqueda,
      pagina,
      tam,
    });
    if (res.ok) {
      setLiveOrders(res.data.items);
      setTotal(res.data.total);
      setConteos(res.data.conteos);
      setProximoNumero(res.data.proximoNumero);
      setSyncError(null);
    } else {
      /* Se conserva la página que ya estaba: perder la pantalla en pleno
       * servicio por un refresco fallido es peor que mostrarla algo vieja. */
      setSyncError(res.error);
    }
    setCargado(true);
  }, [live, branchId, filtro, busqueda, pagina, tam]);

  useEffect(() => {
    if (!live || !branchId) {
      if (!supabaseConfigured) seed();
      return;
    }
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- `reload`
       hace el setState después de un await, no en el cuerpo del efecto. */
    void reload();
    void fetchBranchName(branchId).then((n) => setBranchName(n));
    const sub = subscribeOrders(branchId, reload);
    const onWake = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);

    let ticks = 0;
    const iv = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      ticks++;
      if (ticks % (sub.isHealthy() ? 6 : 1) === 0) void reload();
    }, 5_000);

    return () => {
      sub.unsubscribe();
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
      window.clearInterval(iv);
    };
  }, [live, branchId, seed, reload]);

  const createOrder = useCallback<UseOrders["createOrder"]>(
    async (reference, employee) => {
      if (!live || !branchId) {
        const o: OrderView = {
          id: crypto.randomUUID(),
          reference: reference?.trim() || String(proximoNumero),
          status: "creado",
          createdAt: new Date().toISOString(),
          preparingAt: null,
          readyAt: null,
          pickedUpAt: null,
          cancelledAt: null,
          qrToken: crypto.randomUUID(),
          employee: employee?.name ?? null,
        };
        demoAdd(o);
        return o;
      }
      const employeeId =
        employee && isRealBranchId(employee.id) ? employee.id : null;
      const created = await insertOrder({ branchId, reference, employeeId });
      /* Recargar en vez de meterlo a mano al principio de la lista: la página
       * viene ordenada y recortada por el servidor, así que anteponerlo la
       * dejaría con un elemento de más y en el orden equivocado. */
      if (created) void reload();
      return created;
    },
    [live, branchId, demoAdd, reload, proximoNumero],
  );

  const changeStatus = useCallback<UseOrders["changeStatus"]>(
    async (id, status) => {
      if (!live) {
        demoChange(id, status);
        return null;
      }
      let desde: OrderStatus | undefined;
      setLiveOrders((cur) => {
        desde = cur.find((o) => o.id === id)?.status;
        return cur.map((o) => (o.id === id ? { ...o, status: status } : o));
      });
      const ok = await updateOrderStatus(id, status, desde);
      if (!ok && desde) {
        setLiveOrders((cur) =>
          cur.map((o) => (o.id === id ? { ...o, status: desde! } : o)),
        );
        return null;
      }
      if (status !== "listo" && status !== "retirado") return null;
      return notifyCustomer({ orderId: id });
    },
    [live, demoChange],
  );

  return {
    orders: live ? liveOrders : demoOrders,
    total: live ? total : demoOrders.length,
    conteos: live ? conteos : CONTEOS_VACIOS,
    proximoNumero: live ? proximoNumero : 1,
    ready,
    live,
    branchName,
    syncError: live ? syncError : null,
    createOrder,
    changeStatus,
  };
};
