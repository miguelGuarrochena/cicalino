import {
  alertsBySource,
  sortAlerts,
  unseenAlerts,
  type PanelAlert,
  type PanelAlertSource,
} from "@/lib/panelAlerts";

/* El tablero único de avisos del panel.
 *
 * Cada módulo publica su lista completa de novedades vivas y pisa la anterior
 * (`publishPanelAlerts`), en vez de mandar eventos sueltos. Es a propósito:
 * con listas, una novedad que se resolvió en otra tablet desaparece sola en el
 * refresco siguiente, y no hace falta inventar el evento "ya no pasa esto".
 *
 * El "visto" es del dispositivo. Cerrar el dock calla el aviso global; no
 * marca la mesa como atendida en Mesas (eso sigue en attention-store). */

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
  sourceReady: Record<PanelAlertSource, boolean>;
  version: number;
};

const EMPTY_READY: Record<PanelAlertSource, boolean> = {
  mesas: false,
  pedidos: false,
  recepcion: false,
};

let state: State = {
  branchId: null,
  bySource: EMPTY,
  seen: new Set(),
  sourceReady: EMPTY_READY,
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
    sourceReady: EMPTY_READY,
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
  const already = state.sourceReady[source];
  if (sameIds(state.bySource[source], alerts) && already) return;
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
  state = {
    ...state,
    bySource,
    seen,
    sourceReady: { ...state.sourceReady, [source]: true },
  };
  persist();
  emit();
};

/* Marcar visto sin resolver el trabajo: el pedido sigue pendiente, la cuenta
 * sigue sin cobrarse. El dock calla el aviso; no marca la mesa atendida. */
export const ackPanelAlerts = (alerts: PanelAlert[]) => {
  if (!alerts.length) return;
  const seen = new Set(state.seen);
  for (const a of alerts) seen.add(a.id);
  if (seen.size === state.seen.size) return;
  state = { ...state, seen };
  persist();
  emit();
};

/** Entrar a la sección cuenta como haber mirado sus novedades. */
export const ackPanelSource = (source: PanelAlertSource) => {
  ackPanelAlerts(getLiveAlerts().filter((a) => a.source === source));
};
