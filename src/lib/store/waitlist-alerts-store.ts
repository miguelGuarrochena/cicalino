/** Ids cancelados desde el panel (no alertar al mostrador como si fuera el cliente). */
export const staffWaitlistCancelIds = new Set<string>();

export type GuestCancelAlert = { id: string; name: string };

let queue: GuestCancelAlert[] = [];
let version = 0;
const listeners = new Set<() => void>();

const emit = () => {
  version += 1;
  for (const l of listeners) l();
};

export const pushGuestCancelAlert = (alert: GuestCancelAlert) => {
  if (queue.some((q) => q.id === alert.id)) return;
  queue = [...queue, alert];
  emit();
};

export const peekGuestCancelAlert = (): GuestCancelAlert | null =>
  queue[0] ?? null;

export const getGuestCancelAlertSnapshot = (): GuestCancelAlert[] => queue;

export const getGuestCancelAlertVersion = (): number => version;

export const dismissGuestCancelAlert = (id: string) => {
  const next = queue.filter((q) => q.id !== id);
  if (next.length === queue.length) return;
  queue = next;
  emit();
};

export const subscribeGuestCancelAlerts = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
