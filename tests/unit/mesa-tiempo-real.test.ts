/**
 * El teléfono de la mesa: Realtime primero, la consulta periódica solo de
 * respaldo, y nunca una foto vieja pisando una nueva.
 *
 * Se prueba el comportamiento con timers falsos y un canal de mentira: qué
 * recarga y cuándo, no el texto del código.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { attachLiveRefresh, debounced, watchChannel } from "@/lib/realtime";
import { nextBill, type TableBill } from "@/lib/tableBill";

/* ---- Un navegador mínimo: pestaña, red y timers ----------------------- */

type Handler = () => void;
const crearEntorno = () => {
  const oyentes = new Map<string, Set<Handler>>();
  const on = (t: string, f: Handler) => {
    if (!oyentes.has(t)) oyentes.set(t, new Set());
    oyentes.get(t)!.add(f);
  };
  const off = (t: string, f: Handler) => oyentes.get(t)?.delete(f);
  const doc = { visibilityState: "visible" as "visible" | "hidden", addEventListener: on, removeEventListener: off };
  const win = {
    setTimeout: (f: Handler, ms: number) => setTimeout(f, ms) as unknown as number,
    clearTimeout: (id: number) => clearTimeout(id),
    setInterval: (f: Handler, ms: number) => setInterval(f, ms) as unknown as number,
    clearInterval: (id: number) => clearInterval(id),
    addEventListener: on,
    removeEventListener: off,
  };
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", win);
  const emitir = (t: string) => oyentes.get(t)?.forEach((f) => f());
  return { doc, emitir, oyentes };
};

/* Un canal de Supabase de mentira: guarda el callback de subscribe. */
const crearCanal = () => {
  let estado: ((s: string) => void) | null = null;
  const canal = {
    subscribe: (cb: (s: string) => void) => {
      estado = cb;
      return canal;
    },
  };
  return { canal, emitir: (s: string) => estado?.(s) };
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("respaldo: 30 s con Realtime sano, 5 s caído", () => {
  const montar = (sano: { v: boolean }) => {
    const reload = vi.fn();
    let avisar: Handler = () => {};
    const stop = attachLiveRefresh({
      subscribe: (onChange) => {
        avisar = onChange;
        return { unsubscribe: () => {}, isHealthy: () => sano.v };
      },
      reload,
      ticksSano: 6,
    });
    return { reload, stop, avisar: () => avisar() };
  };

  it("sano: no consulta antes de los 30 s, y a los 30 s consulta una vez", () => {
    crearEntorno();
    const { reload } = montar({ v: true });
    vi.advanceTimersByTime(29_999);
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("caído: consulta cada 5 s", () => {
    crearEntorno();
    const { reload } = montar({ v: false });
    vi.advanceTimersByTime(15_000);
    expect(reload).toHaveBeenCalledTimes(3);
  });

  it("si el canal se cae, pasa a 5 s sin esperar el ciclo de 30", () => {
    crearEntorno();
    const sano = { v: true };
    const { reload } = montar(sano);
    vi.advanceTimersByTime(10_000);
    expect(reload).not.toHaveBeenCalled();
    sano.v = false;
    vi.advanceTimersByTime(5_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("un aviso de Realtime recarga en el acto: los 30 s no frenan nada", () => {
    crearEntorno();
    const { reload, avisar } = montar({ v: true });
    avisar();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("volver a la pestaña, recuperar el foco o la red recarga en el acto", () => {
    const env = crearEntorno();
    const { reload } = montar({ v: true });
    env.emitir("visibilitychange");
    env.emitir("focus");
    env.emitir("online");
    expect(reload).toHaveBeenCalledTimes(3);
  });

  it("con la pestaña oculta no consulta; al volver, sí", () => {
    const env = crearEntorno();
    const { reload } = montar({ v: false });
    env.doc.visibilityState = "hidden";
    vi.advanceTimersByTime(60_000);
    env.emitir("visibilitychange");
    expect(reload).not.toHaveBeenCalled();
    env.doc.visibilityState = "visible";
    env.emitir("visibilitychange");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("al desmontar no queda nada escuchando ni consultando", () => {
    const env = crearEntorno();
    const { reload, stop } = montar({ v: false });
    stop();
    vi.advanceTimersByTime(30_000);
    env.emitir("online");
    expect(reload).not.toHaveBeenCalled();
    expect([...env.oyentes.values()].every((s) => s.size === 0)).toBe(true);
  });
});

describe("reconexión del canal", () => {
  it("SUBSCRIBED marca sano y recarga; un error lo marca caído y reintenta a los 2 s", () => {
    crearEntorno();
    const { canal, emitir } = crearCanal();
    const resubscribe = vi.fn();
    const alConectar = vi.fn();
    const w = watchChannel(canal as never, resubscribe, alConectar);

    emitir("SUBSCRIBED");
    expect(w.state.healthy).toBe(true);
    expect(alConectar).toHaveBeenCalledTimes(1);

    emitir("CHANNEL_ERROR");
    expect(w.state.healthy).toBe(false);
    vi.advanceTimersByTime(1_999);
    expect(resubscribe).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(resubscribe).toHaveBeenCalledTimes(1);
  });

  it("al volver la conexión recarga en el acto lo que se perdió", () => {
    crearEntorno();
    const { canal, emitir } = crearCanal();
    const alConectar = vi.fn();
    watchChannel(canal as never, () => {}, alConectar);
    emitir("SUBSCRIBED");
    emitir("TIMED_OUT");
    emitir("SUBSCRIBED");
    expect(alConectar).toHaveBeenCalledTimes(2);
  });

  it("volver a la pestaña o recuperar la red con el canal caído lo reconecta", () => {
    const env = crearEntorno();
    const { canal, emitir } = crearCanal();
    const resubscribe = vi.fn();
    watchChannel(canal as never, resubscribe);
    emitir("CLOSED");
    env.emitir("online");
    expect(resubscribe).toHaveBeenCalledTimes(1);
  });

  it("con el canal sano, volver a la pestaña no lo reconecta de gusto", () => {
    const env = crearEntorno();
    const { canal, emitir } = crearCanal();
    const resubscribe = vi.fn();
    watchChannel(canal as never, resubscribe);
    emitir("SUBSCRIBED");
    env.emitir("visibilitychange");
    expect(resubscribe).not.toHaveBeenCalled();
  });
});

describe("eventos duplicados de una misma operación", () => {
  it("tres avisos juntos (pagada, cerrada, versión) son una sola recarga", () => {
    crearEntorno();
    const reload = vi.fn();
    const fire = debounced(reload);
    fire();
    fire();
    fire();
    vi.advanceTimersByTime(119);
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

/* ---- nextBill: la versión ordena las fotos ---------------------------- */

const foto = (id: string, version: number, extra: Partial<TableBill["totals"]> = {}): TableBill => ({
  session: {
    id,
    branchId: "l1",
    tableId: "m1",
    tableNumber: 3,
    status: "abierta",
    splitMode: null,
    parts: null,
    version,
    openedAt: "2026-10-08T20:00:00Z",
    updatedAt: "2026-10-08T20:00:00Z",
    paidAt: null,
    closedAt: null,
    closeReason: null,
    calledAt: null,
    billState: "abierta",
    intent: null,
    requestedAt: null,
    requestedBy: null,
    fullPayerId: null,
    fullPayerName: null,
  },
  guests: [],
  orders: [],
  payments: [],
  totals: {
    consumption: 10000,
    tips: 0,
    surcharges: 0,
    total: 10000,
    paid: 0,
    pendingConfirmation: 0,
    paidBase: 0,
    committedBase: 0,
    committedParts: 0,
    uncovered: 10000,
    available: 10000,
    ...extra,
  },
});

describe("nextBill", () => {
  it("una respuesta vieja (versión menor) no pisa la que ya se ve", () => {
    const nueva = foto("s1", 8, { paid: 10000 });
    const vieja = foto("s1", 7);
    expect(nextBill(nueva, vieja)).toBe(nueva);
  });

  it("una versión mayor se aplica", () => {
    const actual = foto("s1", 7);
    const nueva = foto("s1", 8, { paid: 10000 });
    expect(nextBill(actual, nueva)).toBe(nueva);
  });

  it("la misma versión con el mismo contenido no cambia el objeto (no re-render)", () => {
    const actual = foto("s1", 8);
    expect(nextBill(actual, foto("s1", 8))).toBe(actual);
  });

  it("la misma versión con contenido distinto se aplica", () => {
    const actual = foto("s1", 8);
    const otra = foto("s1", 8, { paid: 500 });
    expect(nextBill(actual, otra)).toBe(otra);
  });

  it("otra sesión (una visita nueva) se aplica aunque su versión sea menor", () => {
    const vieja = foto("s1", 12);
    const nueva = foto("s2", 1);
    expect(nextBill(vieja, nueva)).toBe(nueva);
  });

  it("sin nada en pantalla, se aplica", () => {
    const b = foto("s1", 1);
    expect(nextBill(null, b)).toBe(b);
  });

  it("en cualquier orden de llegada, termina en la versión más nueva", () => {
    const fotos = [foto("s1", 5), foto("s1", 9, { paid: 9 }), foto("s1", 7), foto("s1", 9, { paid: 9 }), foto("s1", 6)];
    const final = fotos.reduce<TableBill | null>((cur, f) => nextBill(cur, f), null);
    expect(final?.session.version).toBe(9);
    expect(final?.totals.paid).toBe(9);
  });
});
