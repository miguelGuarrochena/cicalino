"use client";

import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      action?: string;
      callback: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
      theme?: "light" | "dark" | "auto";
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type Props = {
  siteKey: string;
  action?: string;
  onToken: (token: string | null) => void;
  onStatus: (status: "loading" | "ready" | "error") => void;
};

const SCRIPT_ID = "cf-turnstile-script";
const LOAD_TIMEOUT_MS = 12_000;

export const TurnstileField = ({
  siteKey,
  action = "lead",
  onToken,
  onStatus,
}: Props) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  /* The Turnstile callbacks fire long after mount, so they read the latest
   * props through refs instead of being baked into the widget at creation.
   *
   * Updating them runs in an effect rather than during render: mutating a ref
   * while rendering breaks under concurrent rendering, where React can render
   * a component and then throw the result away. */
  const onTokenRef = useRef(onToken);
  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    onTokenRef.current = onToken;
    onStatusRef.current = onStatus;
  }, [onToken, onStatus]);

  useEffect(() => {
    let cancelled = false;
    let loadTimer: number | undefined;
    let pollTimer: number | undefined;

    onStatusRef.current("loading");
    onTokenRef.current(null);

    const fail = () => {
      if (cancelled) return;
      onTokenRef.current(null);
      onStatusRef.current("error");
    };

    const armTimeout = () => {
      window.clearTimeout(loadTimer);
      loadTimer = window.setTimeout(fail, LOAD_TIMEOUT_MS);
    };

    const clearWidget = () => {
      if (widgetId.current != null && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
        }
        widgetId.current = null;
      }
      if (boxRef.current) boxRef.current.innerHTML = "";
    };

    const mount = () => {
      if (cancelled || !boxRef.current || !window.turnstile) return;
      clearWidget();
      armTimeout();
      try {
        widgetId.current = window.turnstile.render(boxRef.current, {
          sitekey: siteKey,
          action,
          theme: "light",
          callback: (token) => {
            if (cancelled) return;
            window.clearTimeout(loadTimer);
            onTokenRef.current(token);
            onStatusRef.current("ready");
          },
          "error-callback": () => {
            window.clearTimeout(loadTimer);
            fail();
          },
          "expired-callback": () => {
            if (cancelled) return;
            onTokenRef.current(null);
            onStatusRef.current("loading");
            armTimeout();
          },
        });
      } catch {
        window.clearTimeout(loadTimer);
        fail();
      }
    };

    armTimeout();

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (window.turnstile) {
      mount();
    } else if (existing) {
      const onLoad = () => mount();
      existing.addEventListener("load", onLoad);
      pollTimer = window.setInterval(() => {
        if (window.turnstile) {
          window.clearInterval(pollTimer);
          mount();
        }
      }, 100);
      window.setTimeout(() => window.clearInterval(pollTimer), LOAD_TIMEOUT_MS);
      return () => {
        cancelled = true;
        window.clearTimeout(loadTimer);
        window.clearInterval(pollTimer);
        existing.removeEventListener("load", onLoad);
        clearWidget();
      };
    } else {
      const s = document.createElement("script");
      s.id = SCRIPT_ID;
      s.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      s.onload = () => mount();
      s.onerror = () => fail();
      document.head.appendChild(s);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(loadTimer);
      window.clearInterval(pollTimer);
      clearWidget();
    };
  }, [siteKey, action]);

  return <div ref={boxRef} className="flex min-h-[65px] justify-center" />;
};
