"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useSessionStore } from "@/lib/store/session-store";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import { useTableBills } from "@/lib/hooks/useTableBills";
import {
  floorAttention,
  pendingBillIds,
  pendingOrderIds,
  type FloorAttention,
} from "@/lib/floorAttention";
import {
  getFloorAttentionState,
  getFloorAttentionVersion,
  hydrateFloorAttention,
  navAckOrders,
  navAckPayments,
  pruneFloorAttention,
  subscribeFloorAttention,
} from "@/lib/store/attention-store";
import { dingNew } from "@/lib/sound";

const EMPTY: FloorAttention = floorAttention(
  [],
  {
    navOrders: new Set(),
    navPayments: new Set(),
    cardOrders: new Set(),
    cardPayments: new Set(),
  },
  null,
);

export const useFloorAttention = (): FloorAttention => {
  const branchId = useSessionStore((s) => s.sucursalId);
  const { visibles } = useOperationalAccess();
  const path = usePathname();
  const billsBranch = visibles.pagos && path.startsWith("/panel") ? branchId : null;
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
 * without double-dinging or double-acking. */
export const useFloorAttentionWatch = () => {
  const branchId = useSessionStore((s) => s.sucursalId);
  const { visibles } = useOperationalAccess();
  const path = usePathname();
  const billsBranch = visibles.pagos && path.startsWith("/panel") ? branchId : null;
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

  useEffect(() => {
    if (!ready) return;
    pruneFloorAttention(orderIds, paymentIds);
  }, [ready, orderIds, paymentIds]);

  useEffect(() => {
    if (!ready) return;
    if (view === "pedido") navAckOrders(orderIds);
    if (view === "cobrar") navAckPayments(paymentIds);
  }, [ready, view, orderIds, paymentIds]);

  const primed = useRef(false);
  const prevHeader = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!ready) return;
    const keys = new Set(attention.headerKeys);
    if (!primed.current) {
      primed.current = true;
      prevHeader.current = keys;
      return;
    }
    let arrived = false;
    for (const id of keys) {
      if (!prevHeader.current.has(id)) arrived = true;
    }
    prevHeader.current = keys;
    if (arrived) dingNew();
  }, [ready, attention.headerKeys]);

  useEffect(() => {
    primed.current = false;
    prevHeader.current = new Set();
  }, [billsBranch]);
};
