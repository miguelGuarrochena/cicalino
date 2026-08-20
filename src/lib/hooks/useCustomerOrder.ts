"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseConfigured } from "@/lib/supabase/config";
import { useConfigStore } from "@/lib/store/config-store";
import { orderByToken, useOrdersStore } from "@/lib/store/orders-store";
import type { IdentificationMode } from "@/lib/store/config-store";
import type { OrderStatus } from "@/lib/types";
import {
  attachCustomerWake,
  createCustomerPollAbort,
  tabVisible,
  type CustomerPollAbort,
} from "@/lib/hooks/customerPollWake";

export interface CustomerOrder {
  reference: string;
  status: OrderStatus;
  branchName: string;
  modo: IdentificationMode;
  notifiedAt: string | null;
}

/* Estado que llega desde el render en el servidor. "unknown" significa que el
 * servidor no pudo resolverlo (modo demo sin Supabase) y decide el cliente. */
export type InitialCustomerOrder =
  | { kind: "ok"; order: CustomerOrder }
  | { kind: "not-found" }
  | { kind: "unknown" };

interface Result {
  ready: boolean;
  found: boolean;
  order: CustomerOrder | null;
}

/* Polling adaptativo.
 *
 * La frecuencia sigue a la distancia que falta para el cambio que le importa
 * al cliente (que el pedido pase a "listo"):
 *
 *   creado          → recién entró a la cola, falta. Consultamos poco.
 *   en_preparacion  → puede salir en cualquier momento. Consultamos seguido.
 *   listo           → el cliente ya lo ve; el próximo salto es "retirado"
 *                     (pestaña abierta). Poll corto.
 *   retirado/cancelado → no hay nada más que mirar, se corta.
 *
 * Antes era un intervalo fijo de 1,2 s: ~50 requests por minuto y por cliente.
 * Con estos valores, una espera típica de 10 minutos pasa de ~500 requests a
 * ~110, sin que la pantalla se sienta más lenta: el salto a "listo" se detecta
 * en 3 s en el peor caso, "retirado" en ~2 s, y además llega el push.
 */
const INTERVALO_MS: Record<OrderStatus, number> = {
  creado: 8_000,
  en_preparacion: 3_000,
  /* Listo: el próximo cambio que importa es "retirado". Tiene que notarse
   * rápido con la pestaña abierta; 6 s se sentía como que no actualizaba. */
  listo: 2_000,
  retirado: 0,
  cancelado: 0,
};

const MAX_BACKOFF_MS = 30_000;

/* Ruido del ±15% para que mil pantallas abiertas a la misma hora no consulten
 * todas en el mismo milisegundo. */
const conJitter = (ms: number): number =>
  Math.round(ms * (0.85 + Math.random() * 0.3));

export const useCustomerOrder = (
  token: string,
  initial: InitialCustomerOrder = { kind: "unknown" },
): Result => {
  const live = supabaseConfigured;

  const seed = useOrdersStore((s) => s.seedSiVacio);
  const demoOrders = useOrdersStore((s) => s.pedidos);
  const cfg = useConfigStore();

  const [remote, setRemote] = useState<CustomerOrder | null>(
    initial.kind === "ok" ? initial.order : null,
  );
  const [remoteFound, setRemoteFound] = useState(initial.kind === "ok");
  const [ready, setReady] = useState(initial.kind !== "unknown");

  /* Solo se usa para arrancar el ciclo; no queremos reiniciar el polling si la
   * referencia del objeto cambia entre renders. */
  const initialRef = useRef(initial);

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

  useEffect(() => {
    if (!live) return;

    const arranque = initialRef.current;
    let active = true;
    let inFlight = false;
    let pendingWake = false;
    let detenido = false;
    let fallos = 0;
    let estado: OrderStatus =
      arranque.kind === "ok" ? arranque.order.status : "creado";
    let timer: number | undefined;
    let pollAbort: CustomerPollAbort | null = null;

    const limpiarTimer = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };

    const proximoDelay = (): number => {
      const base = INTERVALO_MS[estado] || 0;
      if (!base) return 0;
      if (!fallos) return conJitter(base);
      return conJitter(Math.min(base * Math.pow(1.8, fallos), MAX_BACKOFF_MS));
    };

    const programar = () => {
      limpiarTimer();
      if (!active || detenido) return;
      // Pestaña oculta: no se programa nada. Se retoma en onWake.
      if (!tabVisible()) return;
      const delay = proximoDelay();
      if (!delay) return;
      timer = window.setTimeout(() => void load(), delay);
    };

    const load = async () => {
      if (!active || detenido) return;
      if (inFlight) {
        pendingWake = true;
        return;
      }
      inFlight = true;
      pendingWake = false;
      pollAbort = createCustomerPollAbort();
      try {
        const res = await fetch(`/api/p/${token}`, {
          cache: "no-store",
          signal: pollAbort.signal,
        });

        if (res.status === 429 || res.status >= 500) {
          fallos++;
          return;
        }

        const data = await res.json();
        if (!active) return;

        if (data.ok) {
          fallos = 0;
          estado = data.status as OrderStatus;
          setRemote((prev) => ({
            // El nombre del local y el modo los trae el render del servidor y
            // no cambian mientras el cliente espera: el poll no los pide.
            branchName: data.branchName ?? prev?.branchName ?? "",
            modo: (data.modo ?? prev?.modo ?? "pedido") as IdentificationMode,
            reference: data.reference,
            status: estado,
            notifiedAt: data.notifiedAt ?? null,
          }));
          setRemoteFound(true);
          if (estado === "retirado" || estado === "cancelado") detenido = true;
        } else if (data.reason === "not-found" || data.reason === "expired") {
          fallos = 0;
          setRemoteFound(false);
          detenido = true;
        } else {
          fallos++;
        }
      } catch {
        /* Timeout / red: fallo transitorio. El snapshot anterior se queda. */
        if (!active) return;
        fallos++;
      } finally {
        pollAbort?.abort();
        pollAbort = null;
        inFlight = false;
        if (active) {
          setReady(true);
          if (pendingWake) {
            pendingWake = false;
            void load();
          } else {
            programar();
          }
        }
      }
    };

    const onWake = () => {
      if (!tabVisible()) return;
      limpiarTimer();
      void load();
    };

    const onHide = () => {
      if (!tabVisible()) limpiarTimer();
    };

    /* Si el servidor ya nos dio el pedido, la primera consulta no hace falta:
     * la pantalla ya está pintada. Solo programamos la siguiente. */
    if (arranque.kind === "ok") {
      if (estado === "retirado" || estado === "cancelado") detenido = true;
      programar();
    } else if (arranque.kind === "not-found") {
      detenido = true;
      setReady(true);
    } else {
      void load();
    }

    document.addEventListener("visibilitychange", onHide);
    const detachWake = attachCustomerWake(onWake);

    return () => {
      active = false;
      pollAbort?.abort();
      pollAbort = null;
      limpiarTimer();
      document.removeEventListener("visibilitychange", onHide);
      detachWake();
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
          reference: o.reference,
          status: o.status,
          branchName: cfg.name,
          modo: cfg.modo,
          notifiedAt: o.readyAt,
        }
      : null,
  };
};
