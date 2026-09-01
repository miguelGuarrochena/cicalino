"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";

const DEBOUNCE_MS = 120;
const RETRY_MS = 2_000;

export const debounced = (fn: () => void, ms = DEBOUNCE_MS): (() => void) => {
  let id: number | undefined;
  return () => {
    if (id) window.clearTimeout(id);
    id = window.setTimeout(fn, ms);
  };
};

export const throttled = (
  fn: () => void | Promise<void>,
  ms: number,
): (() => void) => {
  let last = 0;
  return () => {
    const now = Date.now();
    if (now - last < ms) return;
    last = now;
    void fn();
  };
};

/* Une los refrescos que se pisan, sin perder ninguno.
 *
 * En la sala, cada acción del mozo dispara dos recargas: la que hace la propia
 * acción (`await reload()`) y la que llega por realtime cuando la base avisa
 * del cambio que esa misma acción acaba de hacer. Con trece llamadas a reload
 * y tres consultas cada una, sentar un grupo eran seis consultas para mostrar
 * un estado que cambió una vez.
 *
 * La regla es "no perder nada": mientras hay una recarga en vuelo, las que
 * llegan no se descartan — dejan marcado que hubo pedidos nuevos y, al
 * terminar la primera, se corre UNA más. Así el último pedido siempre se
 * atiende después de haberse hecho, que es lo que importa cuando el que tocó
 * el botón fue otro mozo en otra tablet.
 *
 * Los que esperan reciben la promesa en vuelo, así que `await reload()`
 * después de una mutación sigue devolviendo datos frescos.
 */
export const coalesced = (
  fn: () => Promise<void>,
): (() => Promise<void>) => {
  let enVuelo: Promise<void> | null = null;
  let pendiente = false;

  const ciclo = async (): Promise<void> => {
    do {
      pendiente = false;
      await fn();
    } while (pendiente);
  };

  return () => {
    if (enVuelo) {
      pendiente = true;
      return enVuelo;
    }
    enVuelo = ciclo().finally(() => {
      enVuelo = null;
    });
    return enVuelo;
  };
};

export const realtimeIsHealthy = (status: string): boolean =>
  status === "SUBSCRIBED";

export const realtimeNeedsResubscribe = (status: string): boolean =>
  status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED";

type ChannelState = { healthy: boolean };

export const watchChannel = (
  channel: RealtimeChannel,
  resubscribe: () => void,
  onSubscribed?: () => void,
): { state: ChannelState; dispose: () => void } => {
  const state: ChannelState = { healthy: false };
  let retry: number | undefined;
  let disposed = false;

  const clearRetry = () => {
    if (retry === undefined) return;
    window.clearTimeout(retry);
    retry = undefined;
  };

  const scheduleRetry = () => {
    if (disposed || retry !== undefined) return;
    retry = window.setTimeout(() => {
      retry = undefined;
      if (!disposed) resubscribe();
    }, RETRY_MS);
  };

  channel.subscribe((status) => {
    if (disposed) return;
    state.healthy = realtimeIsHealthy(status);
    if (status === "SUBSCRIBED") {
      clearRetry();
      onSubscribed?.();
    } else if (realtimeNeedsResubscribe(status)) {
      scheduleRetry();
    }
  });

  const onWake = () => {
    if (document.visibilityState !== "visible") return;
    if (!state.healthy) resubscribe();
  };
  document.addEventListener("visibilitychange", onWake);
  window.addEventListener("online", onWake);

  return {
    state,
    dispose: () => {
      disposed = true;
      clearRetry();
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
    },
  };
};

/* Suscripción de realtime + red de contención, que es lo que ambos paneles
 * necesitan para no quedarse con la pantalla vieja.
 *
 * Estaba escrito dos veces, palabra por palabra, en useOrders y useWaitlist —
 * los mismos tres listeners, el mismo intervalo, el mismo módulo sobre
 * `isHealthy`. Lo único distinto entre las dos copias era cada cuántos ticks
 * refrescar con la suscripción sana.
 *
 * Las tres piezas hacen falta y ninguna reemplaza a las otras:
 *
 *  · la suscripción avisa al toque cuando cambia algo,
 *  · los eventos de despertar cubren la pestaña que estuvo en segundo plano o
 *    el wifi que se cayó y volvió,
 *  · el intervalo es el piso: si la suscripción se cayó sin avisar, refresca
 *    cada tick en vez de cada `ticksSano`.
 */
export const attachLiveRefresh = (opts: {
  subscribe: (onChange: () => void) => {
    unsubscribe: () => void;
    isHealthy: () => boolean;
  };
  reload: () => void;
  /* Cada cuántos ticks refrescar con la suscripción sana. Con la suscripción
   * caída siempre es cada tick. */
  ticksSano: number;
  cadaMs?: number;
}): (() => void) => {
  const { subscribe, reload, ticksSano, cadaMs = 5_000 } = opts;

  const sub = subscribe(reload);

  const onWake = () => {
    if (document.visibilityState === "visible") reload();
  };
  document.addEventListener("visibilitychange", onWake);
  window.addEventListener("focus", onWake);
  window.addEventListener("online", onWake);

  let ticks = 0;
  const iv = window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    ticks++;
    if (ticks % (sub.isHealthy() ? ticksSano : 1) === 0) reload();
  }, cadaMs);

  return () => {
    sub.unsubscribe();
    document.removeEventListener("visibilitychange", onWake);
    window.removeEventListener("focus", onWake);
    window.removeEventListener("online", onWake);
    window.clearInterval(iv);
  };
};
