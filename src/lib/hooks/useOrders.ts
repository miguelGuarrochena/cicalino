"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOrdersStore } from "@/lib/store/orders-store";
import { supabaseConfigured } from "@/lib/supabase/config";
import { attachLiveRefresh, coalesced, throttled } from "@/lib/realtime";
import {
  isRealBranchId,
  fetchOrdersPage,
  fetchBranchName,
  insertOrder,
  markInPreparation,
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
  ) => Promise<{ ok: boolean; notify: NotifyResult | null }>;
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

  /* El paso automático a `en_preparacion` se dispara desde acá, con el mismo
   * criterio que el vencimiento de reservas en useWaitlist: el panel ya
   * consulta cada pocos segundos, así que aprovecha ese ciclo, y el throttle
   * evita mandar el UPDATE en cada refresco. El barrido del cron cubre las
   * sucursales que en ese momento no tengan el panel abierto. */
  const sweepInPreparation = useMemo(
    () =>
      throttled(
        () => (branchId ? markInPreparation(branchId) : undefined),
        60_000,
      ),
    [branchId],
  );

  /* Cuál es la consulta que vale. Cambiar de filtro, de búsqueda o de página
   * arma un `recargar` nuevo, así que puede haber dos consultas en el aire a
   * la vez: la del filtro viejo, que salió antes, y la del nuevo. Si la vieja
   * vuelve segunda —basta con que el servidor tarde un poco más en esa— pinta
   * la pantalla con los pedidos del filtro que el mozo ya dejó atrás.
   *
   * `coalesced` no cubre esto: une las recargas de un mismo `recargar`, y acá
   * son dos distintos. Por eso cada consulta se lleva su número y, al volver,
   * solo aplica si sigue siendo la última que salió. */
  const consulta = useRef(0);

  const recargar = useCallback(async () => {
    if (!live || !branchId) return;
    sweepInPreparation();
    const miConsulta = ++consulta.current;
    const res = await fetchOrdersPage(branchId, {
      filtro,
      busqueda,
      pagina,
      tam,
    });
    if (miConsulta !== consulta.current) return;
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
  }, [live, branchId, filtro, busqueda, pagina, tam, sweepInPreparation]);

  /* Las recargas que se pisan se unen en una, igual que en Recepción y Mesas.
   *
   * Cambiar el estado de un pedido recargaba dos veces: la del propio
   * `changeStatus` y la que rebota por realtime avisando de ese mismo cambio.
   * `coalesced` no pierde ninguna —lo que llega durante una recarga en vuelo
   * fuerza una pasada más al terminar— y quien esperaba recibe esa promesa,
   * así que el `await reload()` de después de una mutación sigue devolviendo
   * datos frescos. */
  /* eslint-disable-next-line react-hooks/refs -- `coalesced` guarda la
     función, no la llama. El contador de `recargar` se lee recién dentro de
     esa función y después del await, nunca durante el render. */
  const reload = useMemo(() => coalesced(recargar), [recargar]);

  /* El canal tiene que llamar al `reload` de ahora, no al que existía cuando
   * se conectó. Se guarda la referencia viva acá para que el efecto de abajo
   * no necesite tener a `reload` entre sus dependencias. */
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  /* Los datos: cambiar de filtro, de búsqueda o de página vuelve a consultar.
   * El setState ocurre después del await, no en el cuerpo del efecto. */
  useEffect(() => {
    void reload();
  }, [reload]);

  /* El canal y el poll: viven mientras dure la sucursal, no el filtro.
   *
   * Estaban en el mismo efecto que la consulta. Como la consulta depende del
   * filtro, de la búsqueda y de la página, tocar cualquiera de los tres
   * desarmaba la suscripción de realtime y la volvía a armar para escuchar
   * exactamente lo mismo: la tabla `pedidos` de esta sucursal. Pasar tres
   * páginas eran tres reconexiones, y cada una deja al panel sordo los
   * milisegundos que tarda en volver a suscribirse.
   *
   * El nombre de la sucursal también estaba acá adentro y se volvía a pedir en
   * cada tecleo del buscador. No depende del filtro: se pide una vez por
   * sucursal. */
  useEffect(() => {
    if (!live || !branchId) {
      if (!supabaseConfigured) seed();
      return;
    }
    void fetchBranchName(branchId).then((n) => setBranchName(n));
    return attachLiveRefresh({
      subscribe: (onChange) => subscribeOrders(branchId, onChange),
      reload: () => void reloadRef.current(),
      ticksSano: 6,
    });
  }, [live, branchId, seed]);

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
          alias: null,
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
        return { ok: true, notify: null };
      }
      const applied = await updateOrderStatus(id, status);
      /* Recargar siempre: el CAS usa orígenes de DB, no el snapshot de la UI.
       * Pintar antes del UPDATE festejaba un cambio que otra caja ya ganó. */
      await reload();
      if (!applied.ok) return { ok: false, notify: null };
      if (status !== "listo" && status !== "retirado") {
        return { ok: true, notify: null };
      }
      return { ok: true, notify: await notifyCustomer({ orderId: id }) };
    },
    [live, demoChange, reload],
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
