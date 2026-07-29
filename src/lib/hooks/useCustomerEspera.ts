"use client";

import { useEffect, useState } from "react";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { useConfigStore } from "@/lib/store/config-store";
import { useEsperaStore } from "@/lib/store/espera-store";
import type { EsperaStatus } from "@/lib/types";

export interface CustomerEspera {
  nombre: string;
  personas: number;
  status: EsperaStatus;
  mesaNumero: number | null;
  nombreLocal: string;
  avisadoEn: string | null;
}

interface Result {
  ready: boolean;
  found: boolean;
  espera: CustomerEspera | null;
}

const POLL_MS = 1200;

export const useCustomerEspera = (token: string): Result => {
  const live = supabaseConfigurado;
  const seed = useEsperaStore((s) => s.seedSiVacio);
  const demoEsperas = useEsperaStore((s) => s.esperas);
  const cfg = useConfigStore();

  const [remote, setRemote] = useState<CustomerEspera | null>(null);
  const [remoteFound, setRemoteFound] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (live) return;
    const done = () => setReady(true);
    const r = useEsperaStore.persist.rehydrate();
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
      if (e.key === "cicalino-espera-demo-v2")
        void useEsperaStore.persist.rehydrate();
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
          });
          setRemoteFound(true);
        } else {
          setRemote(null);
          setRemoteFound(false);
        }
      } catch {
        /* retry */
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
        }
      : null,
  };
};
