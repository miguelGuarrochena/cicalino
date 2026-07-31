"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";

const DEBOUNCE_MS = 120;

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

type ChannelState = { healthy: boolean };

export const watchChannel = (
  channel: RealtimeChannel,
  resubscribe: () => void,
): { state: ChannelState; dispose: () => void } => {
  const state: ChannelState = { healthy: false };

  channel.subscribe((status) => {
    state.healthy = status === "SUBSCRIBED";
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      window.setTimeout(resubscribe, 2_000);
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
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
    },
  };
};
