import {
  alertsBySource,
  sortAlerts,
  unseenAlerts,
  type PanelAlert,
  type PanelAlertSource,
} from "@/lib/panelAlerts";
import { ackTableAttention } from "@/lib/store/attention-store";

/* El tablero único de avisos del panel.
 *
 * Cada módulo publica su lista completa de novedades vivas y pisa la anterior
 * (`publishPanelAlerts`), en vez de mandar eventos sueltos. Es a propósito:
 * con listas, una novedad que se resolvió en otra tablet desaparece sola en el
 * refresco siguiente, y no hace falta inventar el evento "ya no pasa esto".
 *
 * El "visto" es del dispositivo, igual que en Mesas: dos mozos con dos
 * tablets tienen que enterarse los dos. Lo de Mesas no se copia acá — esas
 * alertas se publican ya filtradas por attention-store y descartarlas desde el
 * aviso global escribe en ese mismo store, para que la campanita de Mesas y el
 * aviso global no se contradigan. */

const storageKey = (branchId: string) => `cicalino-panel-alertas-vistas:${branchId}`;

const EMPTY: Record<PanelAlertSource, PanelAlert[]> = {
  mesas: [],
  pedidos: [],
  recepcion: [],
};

type State = {
  branchId: string | null;
  bySource: Record<PanelAlertSource, PanelAlert[]>;
  seen: ReadonlySet<string>;
  version: number;
};

let state: State = {
  branchId: null,
  bySource: EMPTY,
  seen: new Set(),
  version: 0,
};

const listeners = new Set<() => void>();

const emit = () => {
  state = { ...state, version: state.version + 1 };
  for (const l of listeners) l();
};

const readStorage = (branchId: string): ReadonlySet<string> => {
  try {
    const raw = localStorage.getItem(storageKey(branchId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    return new Set();
  }
};

const persist = () => {
  if (!state.branchId) return;
  try {
    localStorage.setItem(
      storageKey(state.branchId),
      JSON.stringify([...state.seen]),
    );
  } catch {
    /* Modo privado o disco lleno: alcanza con recordarlo en esta visita. */
  }
};

export const subscribePanelAlerts = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export const getPanelAlertVersion = (): number => state.version;

export const getPanelAlertState = (): State => state;

const allAlerts = (): PanelAlert[] => [
  ...state.bySource.mesas,
  ...state.bySource.pedidos,
  ...state.bySource.recepcion,
];

/** Lo que hay que mostrar ahora: vivo, no visto y ordenado por urgencia. */
export const getLiveAlerts = (): PanelAlert[] =>
  sortAlerts(unseenAlerts(allAlerts(), state.seen));

export const getLiveAlertCounts = (): Record<PanelAlertSource, number> =>
  alertsBySource(getLiveAlerts());

export const hydratePanelAlerts = (branchId: string | null) => {
  if (state.branchId === branchId) return;
  state = {
    branchId,
    bySource: EMPTY,
    seen: branchId ? readStorage(branchId) : new Set(),
    version: state.version,
  };
  emit();
};

const sameIds = (a: PanelAlert[], b: PanelAlert[]): boolean =>
  a.length === b.length && a.every((x, i) => x.id === b[i].id);

export const publishPanelAlerts = (
  source: PanelAlertSource,
  alerts: PanelAlert[],
) => {
  if (sameIds(state.bySource[source], alerts)) return;
  const bySource = { ...state.bySource, [source]: alerts };
  /* Lo visto se limpia con lo que ya no está vivo. Sin esto, la lista de ids
   * crece toda la jornada y termina en el localStorage de una tablet que no se
   * apaga nunca. */
  const live = new Set(
    [...bySource.mesas, ...bySource.pedidos, ...bySource.recepcion].map(
      (a) => a.id,
    ),
  );
  const seen = new Set([...state.seen].filter((id) => live.has(id)));
  state = { ...state, bySource, seen };
  persist();
  emit();
};

/* Marcar visto sin resolver el trabajo: el pedido sigue pendiente, la cuenta
 * sigue sin cobrarse. Lo de Mesas va a su propio store para que la sección
 * muestre lo mismo que el aviso global. */
export const ackPanelAlerts = (alerts: PanelAlert[]) => {
  if (!alerts.length) return;
  const mesaOrders: string[] = [];
  const mesaPayments: string[] = [];
  const mesaCalls: string[] = [];
  const mesaMp: string[] = [];
  const propios: string[] = [];

  for (const a of alerts) {
    const raw = a.id.slice(a.kind.length + 1);
    if (a.kind === "pedido-mesa") mesaOrders.push(raw);
    else if (a.kind === "cuenta") mesaPayments.push(raw);
    else if (a.kind === "llamado") mesaCalls.push(raw);
    else if (a.kind === "mp-pagado") mesaMp.push(raw);
    else propios.push(a.id);
  }

  if (mesaOrders.length || mesaPayments.length || mesaCalls.length || mesaMp.length) {
    ackTableAttention(mesaOrders, mesaPayments, mesaCalls, mesaMp);
  }
  if (!propios.length) return;

  const seen = new Set(state.seen);
  for (const id of propios) seen.add(id);
  if (seen.size === state.seen.size) return;
  state = { ...state, seen };
  persist();
  emit();
};

/** Entrar a la sección cuenta como haber mirado sus novedades. */
export const ackPanelSource = (source: PanelAlertSource) => {
  ackPanelAlerts(getLiveAlerts().filter((a) => a.source === source));
};
