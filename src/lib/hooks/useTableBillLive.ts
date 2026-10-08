"use client";

import { useEffect, useEffectEvent } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { attachLiveRefresh, debounced, watchChannel } from "@/lib/realtime";

/* Cada cuántos ticks de 5 s consulta el teléfono con Realtime sano: el piso
 * por si un aviso se pierde sin que el canal se entere. Caído, cada tick. */
export const GUEST_TICKS_SANO = 6;

/* The table's channel. The database publishes "cambio" on every write to the
 * bill (guest, staff or the Mercado Pago webhook: mesa-cuenta-broadcast.sql);
 * the message carries no data, the phone reloads the bill from its own
 * authenticated route.
 *
 * Several events from one operation (confirming the last payment touches the
 * session three times) arrive together and are merged into one reload. On
 * (re)subscribe it reloads too: whatever happened while the channel was down
 * is picked up right away. */
export const subscribeTableBill = (
  sessionId: string,
  onChange: () => void,
): { unsubscribe: () => void; isHealthy: () => boolean } => {
  const supabase = createBrowserSupabase();
  if (!supabase) return { unsubscribe: () => {}, isHealthy: () => false };

  const fire = debounced(onChange);
  let disposed = false;
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let watcher: ReturnType<typeof watchChannel> | null = null;

  const connect = () => {
    if (disposed) return;
    if (channel) void supabase.removeChannel(channel);
    watcher?.dispose();
    channel = supabase
      .channel(`mesa-cuenta:${sessionId}`, { config: { private: false } })
      .on("broadcast", { event: "cambio" }, fire);
    watcher = watchChannel(channel, connect, fire);
  };

  connect();
  return {
    unsubscribe: () => {
      disposed = true;
      watcher?.dispose();
      if (channel) void supabase.removeChannel(channel);
    },
    isHealthy: () => watcher?.state.healthy ?? false,
  };
};

/* Other phones at the same table, staff and Mercado Pago. Realtime first; the
 * poll is only the fallback (attachLiveRefresh): every 30 s while the channel
 * is healthy, every 5 s while it's down, and right away when the tab comes
 * back, the network returns or the channel reconnects. */
export const useTableBillLive = (sessionId: string | null, reload: () => void) => {
  const notify = useEffectEvent(() => reload());

  useEffect(() => {
    if (!sessionId) return;
    notify();
    return attachLiveRefresh({
      subscribe: (onChange) => subscribeTableBill(sessionId, onChange),
      reload: () => notify(),
      ticksSano: GUEST_TICKS_SANO,
    });
  }, [sessionId]);
};
