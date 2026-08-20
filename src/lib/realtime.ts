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
