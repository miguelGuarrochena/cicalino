import {
  emptyAttentionSeen,
  pruneSeen,
  withIds,
  type AttentionSeen,
  type FloorView,
} from "@/lib/floorAttention";

/* Per-device memory of what this panel has already looked at.
 *
 * The database still owns "needs kitchen" (`creado`) and "asked for the bill"
 * (guest pending payment). This only answers "has someone at this station
 * seen it?". A later `visto_por_personal_en` can replace the Sets without
 * changing the rest of the inbox. */

const storageKey = (branchId: string) => `cicalino-floor-seen:${branchId}`;

type Persisted = {
  navOrders: string[];
  navPayments: string[];
  navCalls: string[];
  cardOrders: string[];
  cardPayments: string[];
  cardCalls: string[];
};

const toPersist = (seen: AttentionSeen): Persisted => ({
  navOrders: [...seen.navOrders],
  navPayments: [...seen.navPayments],
  navCalls: [...seen.navCalls],
  cardOrders: [...seen.cardOrders],
  cardPayments: [...seen.cardPayments],
  cardCalls: [...seen.cardCalls],
});

const fromPersist = (raw: unknown): AttentionSeen => {
  if (!raw || typeof raw !== "object") return emptyAttentionSeen();
  const r = raw as Partial<Persisted>;
  const set = (v: unknown) =>
    new Set(Array.isArray(v) ? v.filter((id): id is string => typeof id === "string") : []);
  return {
    navOrders: set(r.navOrders),
    navPayments: set(r.navPayments),
    navCalls: set(r.navCalls),
    cardOrders: set(r.cardOrders),
    cardPayments: set(r.cardPayments),
    cardCalls: set(r.cardCalls),
  };
};

const readStorage = (branchId: string): AttentionSeen => {
  try {
    const raw = localStorage.getItem(storageKey(branchId));
    return fromPersist(raw ? JSON.parse(raw) : null);
  } catch {
    return emptyAttentionSeen();
  }
};

const writeStorage = (branchId: string, seen: AttentionSeen) => {
  try {
    localStorage.setItem(storageKey(branchId), JSON.stringify(toPersist(seen)));
  } catch {
    /* Private mode / quota: keep it in memory for this visit. */
  }
};

type State = {
  branchId: string | null;
  seen: AttentionSeen;
  view: FloorView | null;
  version: number;
};

let state: State = {
  branchId: null,
  seen: emptyAttentionSeen(),
  view: null,
  version: 0,
};

const listeners = new Set<() => void>();

const emit = () => {
  state = { ...state, version: state.version + 1 };
  for (const l of listeners) l();
};

const persist = () => {
  if (state.branchId) writeStorage(state.branchId, state.seen);
};

export const subscribeFloorAttention = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export const getFloorAttentionVersion = () => state.version;

export const getFloorAttentionState = (): State => state;

export const hydrateFloorAttention = (branchId: string | null) => {
  if (state.branchId === branchId) return;
  state = {
    branchId,
    seen: branchId ? readStorage(branchId) : emptyAttentionSeen(),
    view: null,
    version: state.version,
  };
  emit();
};

export const setFloorView = (view: FloorView | null) => {
  if (state.view === view) return;
  state = { ...state, view };
  emit();
};

export const navAckOrders = (ids: Iterable<string>) => {
  const next = withIds(state.seen.navOrders, ids);
  if (next.size === state.seen.navOrders.size) return;
  state = { ...state, seen: { ...state.seen, navOrders: next } };
  persist();
  emit();
};

export const navAckPayments = (ids: Iterable<string>) => {
  const next = withIds(state.seen.navPayments, ids);
  if (next.size === state.seen.navPayments.size) return;
  state = { ...state, seen: { ...state.seen, navPayments: next } };
  persist();
  emit();
};

export const navAckCalls = (ids: Iterable<string>) => {
  const next = withIds(state.seen.navCalls, ids);
  if (next.size === state.seen.navCalls.size) return;
  state = { ...state, seen: { ...state.seen, navCalls: next } };
  persist();
  emit();
};

export const cardAckOrders = (ids: Iterable<string>) => {
  const list = [...ids];
  if (!list.length) return;
  state = {
    ...state,
    seen: {
      ...state.seen,
      navOrders: withIds(state.seen.navOrders, list),
      cardOrders: withIds(state.seen.cardOrders, list),
    },
  };
  persist();
  emit();
};

export const cardAckPayments = (ids: Iterable<string>) => {
  const list = [...ids];
  if (!list.length) return;
  state = {
    ...state,
    seen: {
      ...state.seen,
      navPayments: withIds(state.seen.navPayments, list),
      cardPayments: withIds(state.seen.cardPayments, list),
    },
  };
  persist();
  emit();
};

export const cardAckCalls = (ids: Iterable<string>) => {
  const list = [...ids];
  if (!list.length) return;
  state = {
    ...state,
    seen: {
      ...state.seen,
      navCalls: withIds(state.seen.navCalls, list),
      cardCalls: withIds(state.seen.cardCalls, list),
    },
  };
  persist();
  emit();
};

export const ackTableAttention = (
  orders: Iterable<string>,
  payments: Iterable<string>,
  calls: Iterable<string> = [],
) => {
  cardAckOrders(orders);
  cardAckPayments(payments);
  cardAckCalls(calls);
};

export const pruneFloorAttention = (
  orderIds: string[],
  paymentIds: string[],
  callIds: string[] = [],
) => {
  const next = pruneSeen(state.seen, orderIds, paymentIds, callIds);
  if (
    next.navOrders.size === state.seen.navOrders.size &&
    next.navPayments.size === state.seen.navPayments.size &&
    next.navCalls.size === state.seen.navCalls.size &&
    next.cardOrders.size === state.seen.cardOrders.size &&
    next.cardPayments.size === state.seen.cardPayments.size &&
    next.cardCalls.size === state.seen.cardCalls.size
  ) {
    return;
  }
  state = { ...state, seen: next };
  persist();
  emit();
};
