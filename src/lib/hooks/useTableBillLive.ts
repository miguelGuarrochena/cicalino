"use client";

import { useEffect, useEffectEvent } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { watchChannel } from "@/lib/realtime";

/* Other phones at the same table. The database is the source; this only
 * asks the client to reload when someone else writes. Polling remains the
 * floor if the subscription drops. */
export const useTableBillLive = (sessionId: string | null, onChange: () => void) => {
  const notify = useEffectEvent(() => onChange());

  useEffect(() => {
    if (!sessionId) return;
    const supabase = createBrowserSupabase();
    if (!supabase) return;

    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let watcher: { dispose: () => void } | null = null;

    const connect = () => {
      if (disposed) return;
      if (channel) void supabase.removeChannel(channel);
      watcher?.dispose();
      channel = supabase
        .channel(`mesa-cuenta:${sessionId}`, { config: { private: false } })
        .on("broadcast", { event: "cambio" }, () => {
          notify();
        });
      watcher = watchChannel(channel, connect);
    };

    connect();
    return () => {
      disposed = true;
      watcher?.dispose();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [sessionId]);
};
