import { create } from "zustand";

export type EsperaCancelAlert = {
  id: string;
  nombre: string;
  at: number;
  fromGuest: boolean;
};

interface EsperaAlertsState {
  alerts: EsperaCancelAlert[];
  pushCancel: (a: Omit<EsperaCancelAlert, "at"> & { at?: number }) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

/** IDs cancelados desde el panel (vs. cliente). */
export const staffEsperaCancelIds = new Set<string>();

/** Avisos de cancelación de espera visibles en todo el panel. */
export const useEsperaAlertsStore = create<EsperaAlertsState>((set) => ({
  alerts: [],
  pushCancel: (a) =>
    set((s) => {
      if (s.alerts.some((x) => x.id === a.id)) return s;
      const next: EsperaCancelAlert = {
        id: a.id,
        nombre: a.nombre,
        fromGuest: a.fromGuest,
        at: a.at ?? Date.now(),
      };
      return { alerts: [next, ...s.alerts].slice(0, 12) };
    }),
  dismiss: (id) =>
    set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
  dismissAll: () => set({ alerts: [] }),
}));
