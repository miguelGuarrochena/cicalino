"use client";

import { useEffect, useState } from "react";
import { supabaseConfigured } from "@/lib/supabase/config";
import { useConfigStore } from "@/lib/store/config-store";
import { useWaitlistStore } from "@/lib/store/waitlist-store";
import type { WaitlistStatus } from "@/lib/types";
import {
  attachCustomerWake,
  createCustomerPollAbort,
  customerPollUrl,
  tabVisible,
  VISIT_POLL_GAP_MS,
  type CustomerPollAbort,
} from "@/lib/hooks/customerPollWake";

export interface CustomerWaitlistQueue {
  gruposDelante: number;
  personasDelante: number;
  gruposEnCola: number;
  personasEnCola: number;
}

export interface CustomerWaitlist {
  name: string;
  partySize: number;
  status: WaitlistStatus;
  tableNumber: number | null;
  branchName: string;
  notifiedAt: string | null;
  cola: CustomerWaitlistQueue;
}

interface Result {
  ready: boolean;
  found: boolean;
  espera: CustomerWaitlist | null;
}

/* Polling adaptativo (mismo criterio que useCustomerOrder).
 *
 * Antes: intervalo fijo 1,2 s → ~50 req/min por cliente en cola.
 * Ahora:
 *   esperando → 5 s (posición de cola importa, pero no tanto como avisado)
 *   avisado   → 3 s (puede sentarse en cualquier momento)
 *   sentado / cancelado → se corta
 */
const INTERVALO_MS: Record<WaitlistStatus, number> = {
  esperando: 5_000,
  /* Avisado → sentado/cancelado: mismo criterio que pedido listo. */
  avisado: 2_000,
  sentado: 0,
  cancelado: 0,
};

const MAX_BACKOFF_MS = 30_000;

const conJitter = (ms: number): number =>
  Math.round(ms * (0.85 + Math.random() * 0.3));

const emptyCola = (): CustomerWaitlistQueue => ({
  gruposDelante: 0,
  personasDelante: 0,
  gruposEnCola: 0,
  personasEnCola: 0,
});

const normalizeCola = (
  raw: Partial<CustomerWaitlistQueue> | null | undefined,
): CustomerWaitlistQueue => ({
  ...emptyCola(),
  ...raw,
});

const WAITLIST_STATUS: readonly WaitlistStatus[] = [
  "esperando",
  "avisado",
  "sentado",
  "cancelado",
];

const isWaitlistStatus = (v: unknown): v is WaitlistStatus =>
  typeof v === "string" &&
  (WAITLIST_STATUS as readonly string[]).includes(v);

export type WaitlistPollDecision =
  | { kind: "ok"; espera: CustomerWaitlist }
  | { kind: "gone" }
  | { kind: "transient" };

/**
 * Semántica de GET /api/e/{token}:
 *  - 200 + ok → snapshot (esperando / avisado / sentado / cancelado)
 *  - reason not-found | expired → la espera ya no existe; sí se puede vaciar
 *  - 429, 5xx, rate-limited, not-configured, JSON raro → transitorio; no vaciar
 */
export const interpretWaitlistPollResponse = (
  httpStatus: number,
  body: unknown,
): WaitlistPollDecision => {
  if (httpStatus === 429 || httpStatus >= 500) return { kind: "transient" };

  if (body === null || typeof body !== "object") return { kind: "transient" };
  const data = body as Record<string, unknown>;

  if (data.ok === true) {
    if (!isWaitlistStatus(data.status)) return { kind: "transient" };
    return {
      kind: "ok",
      espera: {
        name: typeof data.name === "string" ? data.name : "",
        partySize:
          typeof data.partySize === "number" && Number.isFinite(data.partySize)
            ? data.partySize
            : 0,
        status: data.status,
        tableNumber:
          typeof data.tableNumber === "number" ? data.tableNumber : null,
        branchName: typeof data.branchName === "string" ? data.branchName : "",
        notifiedAt: typeof data.notifiedAt === "string" ? data.notifiedAt : null,
        cola: normalizeCola(
          data.cola as Partial<CustomerWaitlistQueue> | null | undefined,
        ),
      },
    };
  }

  if (data.reason === "not-found" || data.reason === "expired") {
    return { kind: "gone" };
  }

  return { kind: "transient" };
};

const colaFromDemo = (
  token: string,
  esperas: {
    id: string;
    qrToken: string;
    partySize: number;
    status: string;
    createdAt: string;
  }[],
): CustomerWaitlistQueue => {
  const yo = esperas.find((e) => e.qrToken === token);
  const activos = esperas.filter(
    (e) => e.status === "esperando" || e.status === "avisado",
  );
  if (!yo) return emptyCola();
  const miCreado = new Date(yo.createdAt).getTime();
  let gruposDelante = 0;
  let personasDelante = 0;
  let gruposEnCola = 0;
  let personasEnCola = 0;
  for (const row of activos) {
    gruposEnCola += 1;
    personasEnCola += row.partySize;
    if (row.id === yo.id) continue;
    const t = new Date(row.createdAt).getTime();
    if (t < miCreado || (t === miCreado && row.id < yo.id)) {
      gruposDelante += 1;
      personasDelante += row.partySize;
    }
  }
  return {
    gruposDelante,
    personasDelante,
    gruposEnCola,
    personasEnCola,
  };
};

export const useCustomerWaitlist = (token: string): Result => {
  const live = supabaseConfigured;
  const seed = useWaitlistStore((s) => s.seedSiVacio);
  const demoEsperas = useWaitlistStore((s) => s.esperas);
  const cfg = useConfigStore();

  const [remote, setRemote] = useState<CustomerWaitlist | null>(null);
  const [remoteFound, setRemoteFound] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (live) return;
    const done = () => setReady(true);
    const r = useWaitlistStore.persist.rehydrate();
    if (r && typeof (r as Promise<void>).then === "function") {
      void (r as Promise<void>).then(() => {
        seed(cfg.tableCount);
        done();
      });
    } else {
      seed(cfg.tableCount);
      done();
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === "cicalino-espera-demo-v3")
        void useWaitlistStore.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [live, seed, cfg.tableCount]);

  useEffect(() => {
    if (!live) return;
    let active = true;
    let inFlight = false;
    let pendingWake = false;
    let pendingVisit = false;
    let lastVisitAt = 0;
    let detenido = false;
    let fallos = 0;
    let estado: WaitlistStatus = "esperando";
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
      if (!tabVisible()) return;
      const delay = proximoDelay();
      if (!delay) return;
      timer = window.setTimeout(() => void load(), delay);
    };

    const load = async (opts?: { visit?: boolean }) => {
      if (!active || detenido) return;
      if (inFlight) {
        pendingWake = true;
        if (opts?.visit) pendingVisit = true;
        return;
      }
      const wantVisit = Boolean(opts?.visit) || pendingVisit;
      pendingVisit = false;
      pendingWake = false;
      inFlight = true;
      const now = Date.now();
      const visit = wantVisit && now - lastVisitAt >= VISIT_POLL_GAP_MS;
      if (visit) lastVisitAt = now;
      pollAbort = createCustomerPollAbort();
      try {
        const res = await fetch(customerPollUrl(`/api/e/${token}`, visit), {
          cache: "no-store",
          signal: pollAbort.signal,
        });
        const data: unknown = await res.json();
        if (!active) return;

        const decision = interpretWaitlistPollResponse(res.status, data);
        if (decision.kind === "ok") {
          fallos = 0;
          estado = decision.espera.status;
          setRemote(decision.espera);
          setRemoteFound(true);
          setReady(true);
          if (estado === "sentado" || estado === "cancelado") detenido = true;
        } else if (decision.kind === "gone") {
          fallos = 0;
          setRemote(null);
          setRemoteFound(false);
          setReady(true);
          detenido = true;
        } else {
          /* 429 / 5xx / JSON inesperado / not-configured: el snapshot se queda. */
          fallos++;
        }
      } catch {
        /* Timeout, red, JSON inválido o unmount: fallo transitorio. */
        if (!active) return;
        fallos++;
      } finally {
        pollAbort?.abort();
        pollAbort = null;
        inFlight = false;
        if (active) {
          if (pendingWake) {
            const v = pendingVisit;
            pendingWake = false;
            pendingVisit = false;
            void load(v ? { visit: true } : undefined);
          } else {
            programar();
          }
        }
      }
    };

    const onWake = () => {
      if (!tabVisible()) return;
      limpiarTimer();
      void load({ visit: true });
    };

    const onHide = () => {
      if (!tabVisible()) limpiarTimer();
    };

    document.addEventListener("visibilitychange", onHide);
    const detachWake = attachCustomerWake(onWake);
    void load();

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
    return { ready, found: remoteFound, espera: remote };
  }

  const demo = demoEsperas.find((e) => e.qrToken === token) ?? null;
  return {
    ready,
    found: Boolean(demo),
    espera: demo
      ? {
          name: demo.name,
          partySize: demo.partySize,
          status: demo.status,
          tableNumber: demo.tableNumber,
          branchName: cfg.name || "Local",
          notifiedAt: demo.notifiedAt,
          cola: colaFromDemo(token, demoEsperas),
        }
      : null,
  };
};

/** Expuesto para tests: intervalos por estado (sin jitter). */
export const WAITLIST_POLL_MS = INTERVALO_MS;
