"use client";

import { useEffect } from "react";

interface Sentinel {
  release: () => Promise<void>;
}

// Mantiene la pantalla encendida mientras el componente esté montado (útil en
// la tablet/teléfono del mostrador). Re-solicita el lock al volver de segundo
// plano. Silencioso si el navegador no soporta la API.
export const useWakeLock = (active = true) => {
  useEffect(() => {
    if (!active || typeof navigator === "undefined") return;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<Sentinel> };
    };
    if (!nav.wakeLock) return;

    let sentinel: Sentinel | null = null;
    let cancelled = false;

    const request = async () => {
      try {
        sentinel = await nav.wakeLock!.request("screen");
      } catch {
        /* usuario/navegador lo rechazó */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && !cancelled) request();
    };

    request();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      sentinel?.release().catch(() => {});
    };
  }, [active]);
};
