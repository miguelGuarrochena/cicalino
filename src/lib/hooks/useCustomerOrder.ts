"use client";

import { useEffect, useState } from "react";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { useConfigStore } from "@/lib/store/config-store";
import { orderByToken, useOrdersStore } from "@/lib/store/orders-store";
import type { IdentificationMode } from "@/lib/store/config-store";
import type { OrderStatus } from "@/lib/types";

export interface CustomerOrder {
  referencia: string;
  status: OrderStatus;
  nombreLocal: string;
  modo: IdentificationMode;
  /** ISO del último aviso "listo" / re-avisar (para repetir la señal). */
  avisadoEn: string | null;
}

interface Result {
  ready: boolean;
  found: boolean;
  order: CustomerOrder | null;
}

// ~1.2s: el cliente ve el "listo" casi al toque (antes 4s → demora típica 1–2s).
const POLL_MS = 1200;

// Estado del pedido para la pantalla del cliente. Con Supabase configurado
// hace polling al endpoint público (/api/p/[token]); en demo lee del store
// local (mismo navegador que el panel).
export const useCustomerOrder = (token: string): Result => {
  const live = supabaseConfigurado;

  // --- Demo (Zustand) ---
  const seed = useOrdersStore((s) => s.seedSiVacio);
  const demoOrders = useOrdersStore((s) => s.pedidos);
  const cfg = useConfigStore();

  // --- Live (polling) ---
  const [remote, setRemote] = useState<CustomerOrder | null>(null);
  const [remoteFound, setRemoteFound] = useState(false);
  const [ready, setReady] = useState(false);

  // Hidratación + sync entre pestañas para el modo demo.
  useEffect(() => {
    if (live) return;
    const done = () => setReady(true);
    const r = useOrdersStore.persist.rehydrate();
    if (r && typeof (r as Promise<void>).then === "function") {
      void (r as Promise<void>).then(() => {
        seed();
        done();
      });
    } else {
      seed();
      done();
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === "cicalino-pedidos") void useOrdersStore.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [live, seed]);

  // Polling del endpoint público + refetch al volver a la pestaña.
  useEffect(() => {
    if (!live) return;
    let active = true;
    let inFlight = false;
    let id: number | undefined;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/p/${token}`, { cache: "no-store" });
        if (res.status === 429 || res.status >= 500) return;
        const data = await res.json();
        if (!active) return;
        if (data.ok) {
          setRemote({
            referencia: data.referencia,
            status: data.estado as OrderStatus,
            nombreLocal: data.nombreLocal,
            modo: data.modo as IdentificationMode,
            avisadoEn: data.avisadoEn ?? null,
          });
          setRemoteFound(true);
          if (data.estado === "retirado" || data.estado === "cancelado") {
            if (id) window.clearInterval(id);
          }
        } else if (data.reason === "not-found" || data.reason === "expired") {
          setRemoteFound(false);
        }
      } catch {
        /* sin red: mantenemos el último estado */
      } finally {
        inFlight = false;
        if (active) setReady(true);
      }
    };
    void load();
    id = window.setInterval(load, POLL_MS);

    const onWake = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);

    return () => {
      active = false;
      if (id) window.clearInterval(id);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
    };
  }, [live, token]);

  if (live) {
    return { ready, found: remoteFound, order: remote };
  }

  const o = orderByToken(demoOrders, token);
  return {
    ready,
    found: !!o,
    order: o
      ? {
          referencia: o.referencia,
          status: o.estado,
          nombreLocal: cfg.nombre,
          modo: cfg.modo,
          avisadoEn: o.listoEn,
        }
      : null,
  };
};
