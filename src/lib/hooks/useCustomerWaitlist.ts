"use client";

import { useEffect, useState } from "react";
import { supabaseConfigured } from "@/lib/supabase/config";
import { useConfigStore } from "@/lib/store/config-store";
import { useWaitlistStore } from "@/lib/store/waitlist-store";
import type { WaitlistStatus } from "@/lib/types";

export interface CustomerWaitlistQueue {
  gruposDelante: number;
  personasDelante: number;
  gruposEnCola: number;
  personasEnCola: number;
}

export interface CustomerWaitlist {
  nombre: string;
  personas: number;
  status: WaitlistStatus;
  mesaNumero: number | null;
  nombreLocal: string;
  avisadoEn: string | null;
  cola: CustomerWaitlistQueue;
}

interface Result {
  ready: boolean;
  found: boolean;
  espera: CustomerWaitlist | null;
}

const POLL_MS = 1200;

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

const colaFromDemo = (
  token: string,
  esperas: {
    id: string;
    qrToken: string;
    personas: number;
    estado: string;
    creadoEn: string;
  }[],
): CustomerWaitlistQueue => {
  const yo = esperas.find((e) => e.qrToken === token);
  const activos = esperas.filter(
    (e) => e.estado === "esperando" || e.estado === "avisado",
  );
  if (!yo) return emptyCola();
  const miCreado = new Date(yo.creadoEn).getTime();
  let gruposDelante = 0;
  let personasDelante = 0;
  let gruposEnCola = 0;
  let personasEnCola = 0;
  for (const row of activos) {
    gruposEnCola += 1;
    personasEnCola += row.personas;
    if (row.id === yo.id) continue;
    const t = new Date(row.creadoEn).getTime();
    if (t < miCreado || (t === miCreado && row.id < yo.id)) {
      gruposDelante += 1;
      personasDelante += row.personas;
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
        seed(cfg.cantidadMesas);
        done();
      });
    } else {
      seed(cfg.cantidadMesas);
      done();
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === "cicalino-espera-demo-v3")
        void useWaitlistStore.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [live, seed, cfg.cantidadMesas]);

  useEffect(() => {
    if (!live) return;
    let active = true;
    let inFlight = false;
    let id: number | undefined;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/e/${token}`, { cache: "no-store" });
        if (res.status === 429 || res.status >= 500) return;
        const data = await res.json();
        if (!active) return;
        if (data.ok) {
          setRemote({
            nombre: data.nombre,
            personas: data.personas,
            status: data.estado,
            mesaNumero: data.mesaNumero,
            nombreLocal: data.nombreLocal,
            avisadoEn: data.avisadoEn,
            cola: normalizeCola(data.cola),
          });
          setRemoteFound(true);
        } else {
          setRemote(null);
          setRemoteFound(false);
        }
      } catch {
      } finally {
        inFlight = false;
        if (active) setReady(true);
      }
    };
    void load();
    id = window.setInterval(() => void load(), POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      active = false;
      if (id) window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
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
          nombre: demo.nombre,
          personas: demo.personas,
          status: demo.estado,
          mesaNumero: demo.mesaNumero,
          nombreLocal: cfg.nombre || "Local",
          avisadoEn: demo.avisadoEn,
          cola: colaFromDemo(token, demoEsperas),
        }
      : null,
  };
};
