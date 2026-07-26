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
}

interface Result {
  ready: boolean;
  found: boolean;
  order: CustomerOrder | null;
}

const POLL_MS = 4000;

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

  // Polling del endpoint público.
  useEffect(() => {
    if (!live) return;
    let active = true;
    let inFlight = false;
    let id: number | undefined;
    const load = async () => {
      // En redes lentas, evitamos apilar requests: si el anterior sigue en
      // vuelo, saltamos este tick.
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/p/${token}`, { cache: "no-store" });
        // Límite alcanzado o error transitorio del server: mantenemos el último
        // estado conocido y reintentamos en el próximo tick.
        if (res.status === 429 || res.status >= 500) return;
        const data = await res.json();
        if (!active) return;
        if (data.ok) {
          setRemote({
            referencia: data.referencia,
            status: data.estado as OrderStatus,
            nombreLocal: data.nombreLocal,
            modo: data.modo as IdentificationMode,
          });
          setRemoteFound(true);
          // Estado terminal: dejamos de pollear (no hay más cambios).
          if (data.estado === "retirado" || data.estado === "cancelado") {
            if (id) window.clearInterval(id);
          }
        } else if (data.reason === "not-found" || data.reason === "expired") {
          // Solo blanqueamos si el pedido realmente no existe o venció; el resto
          // de las razones son transitorias y conservan el último estado.
          setRemoteFound(false);
        }
      } catch {
        // sin red: mantenemos el último estado conocido
      } finally {
        inFlight = false;
        if (active) setReady(true);
      }
    };
    void load();
    id = window.setInterval(load, POLL_MS);
    return () => {
      active = false;
      if (id) window.clearInterval(id);
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
        }
      : null,
  };
};
