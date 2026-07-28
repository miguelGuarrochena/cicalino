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
  onToken: (token: string | null) => void;
  onStatus: (status: "loading" | "ready" | "error") => void;
};

const SCRIPT_ID = "cf-turnstile-script";

/** Carga el script una vez y renderiza el widget de forma explícita (SPA-safe). */
export const TurnstileField = ({ siteKey, onToken, onStatus }: Props) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onStatusRef = useRef(onStatus);
  onTokenRef.current = onToken;
  onStatusRef.current = onStatus;

  useEffect(() => {
    let cancelled = false;
    onStatusRef.current("loading");
    onTokenRef.current(null);

    const mount = () => {
      if (cancelled || !boxRef.current || !window.turnstile) return;
      if (widgetId.current != null) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* ignore */
        }
        widgetId.current = null;
      }
      boxRef.current.innerHTML = "";
      try {
        widgetId.current = window.turnstile.render(boxRef.current, {
          sitekey: siteKey,
          action: "probar",
          theme: "auto",
          callback: (token) => {
            onTokenRef.current(token);
            onStatusRef.current("ready");
          },
          "error-callback": () => {
            onTokenRef.current(null);
            onStatusRef.current("error");
          },
          "expired-callback": () => {
            onTokenRef.current(null);
            onStatusRef.current("loading");
          },
        });
      } catch {
        onStatusRef.current("error");
      }
    };

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (window.turnstile) {
      mount();
    } else if (existing) {
      existing.addEventListener("load", mount);
      // Si ya estaba cargado pero window.turnstile aún no (race), reintentar.
      const t = window.setInterval(() => {
        if (window.turnstile) {
          window.clearInterval(t);
          mount();
        }
      }, 100);
      window.setTimeout(() => window.clearInterval(t), 8000);
    } else {
      const s = document.createElement("script");
      s.id = SCRIPT_ID;
      s.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      s.onload = () => mount();
      s.onerror = () => {
        if (!cancelled) onStatusRef.current("error");
      };
      document.head.appendChild(s);
    }

    return () => {
      cancelled = true;
      if (widgetId.current != null && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* ignore */
        }
        widgetId.current = null;
      }
    };
  }, [siteKey]);

  return <div ref={boxRef} className="flex min-h-[65px] justify-center" />;
};
