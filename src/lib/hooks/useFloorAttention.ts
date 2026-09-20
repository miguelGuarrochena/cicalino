"use client";

import { useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useSessionStore } from "@/lib/store/session-store";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import { useJornadaActiva } from "@/lib/hooks/useJornadaActiva";
import { useTableBills } from "@/lib/hooks/useTableBills";
import {
  emptyAttentionSeen,
  floorAttention,
  pendingBillIds,
  mpPaidIds,
  pendingOrderIds,
  waiterCallSessionIds,
  type FloorAttention,
} from "@/lib/floorAttention";
import {
  getFloorAttentionState,
  getFloorAttentionVersion,
  hydrateFloorAttention,
  navAckCalls,
  navAckOrders,
  navAckPayments,
  pruneFloorAttention,
  subscribeFloorAttention,
} from "@/lib/store/attention-store";
import { mesaAlerts } from "@/lib/panelAlerts";
import { publishPanelAlerts } from "@/lib/store/panel-alert-store";

const EMPTY: FloorAttention = floorAttention([], emptyAttentionSeen(), null);

export const useFloorAttention = (): FloorAttention => {
  const branchId = useSessionStore((s) => s.sucursalId);
  const { visibles } = useOperationalAccess();
  const jornadaActiva = useJornadaActiva();
  const path = usePathname();
  const billsBranch =
    visibles.pagos && jornadaActiva && path.startsWith("/panel")
      ? branchId
      : null;
  const { bills, ready } = useTableBills(billsBranch);
  const version = useSyncExternalStore(
    subscribeFloorAttention,
    getFloorAttentionVersion,
    () => 0,
  );
  void version;
  const { seen, view } = getFloorAttentionState();

  return useMemo(
    () => (visibles.pagos && ready ? floorAttention(bills, seen, view) : EMPTY),
    [visibles.pagos, ready, bills, seen, view],
  );
};

/* Side effects live in one place so the header can read the same snapshot
 * without double-acking. El sonido ya no vive acá: lo hace la capa global
 * (usePanelAlertsWatch) para que Mesas, Pedidos y Recepción suenen igual y una
 * sola vez. */
export const useFloorAttentionWatch = () => {
  const branchId = useSessionStore((s) => s.sucursalId);
  const { visibles } = useOperationalAccess();
  const jornadaActiva = useJornadaActiva();
  const path = usePathname();
  const billsBranch =
    visibles.pagos && jornadaActiva && path.startsWith("/panel")
      ? branchId
      : null;
  const { bills, ready } = useTableBills(billsBranch);
  const version = useSyncExternalStore(
    subscribeFloorAttention,
    getFloorAttentionVersion,
    () => 0,
  );
  void version;
  const { seen, view } = getFloorAttentionState();
  const attention = useMemo(
    () => (visibles.pagos && ready ? floorAttention(bills, seen, view) : EMPTY),
    [visibles.pagos, ready, bills, seen, view],
  );

  useLayoutEffect(() => {
    hydrateFloorAttention(billsBranch);
  }, [billsBranch]);

  const orderIds = useMemo(() => pendingOrderIds(bills), [bills]);
  const paymentIds = useMemo(() => pendingBillIds(bills), [bills]);
  const callIds = useMemo(() => waiterCallSessionIds(bills), [bills]);
  const mpIds = useMemo(() => mpPaidIds(bills), [bills]);

  useEffect(() => {
    if (!ready) return;
    pruneFloorAttention(orderIds, paymentIds, callIds, mpIds);
  }, [ready, orderIds, paymentIds, callIds, mpIds]);

  useEffect(() => {
    if (!ready) return;
    /* La pestaña Pedido muestra los pedidos nuevos y los llamados; Cobrar, las
     * cuentas. Mirar la cola cuenta como haberlas visto. */
    if (view === "pedido") {
      navAckOrders(orderIds);
      navAckCalls(callIds);
    }
    if (view === "cobrar") navAckPayments(paymentIds);
  }, [ready, view, orderIds, paymentIds, callIds]);

  /* Lo de Mesas entra a la capa global igual que cualquier otro módulo. */
  useEffect(() => {
    publishPanelAlerts("mesas", ready ? mesaAlerts(bills, attention) : []);
  }, [ready, bills, attention]);
};
