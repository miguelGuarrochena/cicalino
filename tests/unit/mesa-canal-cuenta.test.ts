/**
 * El canal de la mesa con un cliente de Supabase de mentira: el teléfono
 * escucha el topic que publica la base, junta los avisos de una operación y
 * recarga al reconectarse.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Estado = (s: string) => void;
const canales: { topic: string; onCambio: () => void; estado: Estado | null; config: unknown }[] = [];
const removidos: unknown[] = [];

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    channel: (topic: string, config: unknown) => {
      const c = { topic, onCambio: () => {}, estado: null as Estado | null, config };
      const api = {
        on: (_tipo: string, _filtro: unknown, cb: () => void) => {
          c.onCambio = cb;
          return api;
        },
        subscribe: (cb: Estado) => {
          c.estado = cb;
          return api;
        },
      };
      canales.push(c);
      return api;
    },
    removeChannel: (ch: unknown) => {
      removidos.push(ch);
      return Promise.resolve();
    },
  }),
}));

import { subscribeTableBill, GUEST_TICKS_SANO } from "@/lib/hooks/useTableBillLive";

beforeEach(() => {
  vi.useFakeTimers();
  canales.length = 0;
  removidos.length = 0;
  const noop = () => {};
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: noop, removeEventListener: noop });
  vi.stubGlobal("window", {
    setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    addEventListener: noop,
    removeEventListener: noop,
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("subscribeTableBill", () => {
  it("escucha el canal público que publica el trigger", () => {
    subscribeTableBill("abc", () => {});
    expect(canales[0]?.topic).toBe("mesa-cuenta:abc");
    expect(canales[0]?.config).toEqual({ config: { private: false } });
  });

  it("los avisos de una misma operación se juntan en una recarga", () => {
    const onChange = vi.fn();
    subscribeTableBill("abc", onChange);
    canales[0]!.onCambio();
    canales[0]!.onCambio();
    canales[0]!.onCambio();
    vi.advanceTimersByTime(200);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("sano solo con SUBSCRIBED; al reconectar recarga lo que se perdió", () => {
    const onChange = vi.fn();
    const sub = subscribeTableBill("abc", onChange);
    expect(sub.isHealthy()).toBe(false);
    canales[0]!.estado!("SUBSCRIBED");
    expect(sub.isHealthy()).toBe(true);
    vi.advanceTimersByTime(200);
    expect(onChange).toHaveBeenCalledTimes(1);

    canales[0]!.estado!("CHANNEL_ERROR");
    expect(sub.isHealthy()).toBe(false);
    vi.advanceTimersByTime(2_000);
    /* Se crea un canal nuevo para la misma mesa y se suelta el viejo. */
    expect(canales).toHaveLength(2);
    expect(removidos).toHaveLength(1);
    canales[1]!.estado!("SUBSCRIBED");
    vi.advanceTimersByTime(200);
    expect(sub.isHealthy()).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("al cerrar no reintenta ni recarga", () => {
    const onChange = vi.fn();
    const sub = subscribeTableBill("abc", onChange);
    sub.unsubscribe();
    canales[0]!.estado!("CLOSED");
    vi.advanceTimersByTime(5_000);
    expect(canales).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("el respaldo con Realtime sano es de 30 s (6 ticks de 5 s)", () => {
    expect(GUEST_TICKS_SANO * 5_000).toBe(30_000);
  });
});
