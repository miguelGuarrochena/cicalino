"use client";

import { useCallback, useEffect, useState } from "react";
import { useEsperaStore } from "@/lib/store/espera-store";
import { useConfigStore } from "@/lib/store/config-store";
import { supabaseConfigurado } from "@/lib/supabase/config";
import {
  isRealBranchId,
  fetchTodayEsperas,
  fetchMesas,
  syncMesas,
  insertEspera,
  updateEsperaStatus,
  setMesaEstado,
  subscribeEsperas,
} from "@/lib/data/espera";
import type { EsperaStatus, EsperaView, MesaView } from "@/lib/types";

type EmployeeRef = { id: string; nombre: string } | null;

export interface UseEsperas {
  esperas: EsperaView[];
  mesas: MesaView[];
  ready: boolean;
  live: boolean;
  crearEspera: (
    nombre: string,
    personas: number,
    employee?: EmployeeRef,
  ) => Promise<EsperaView | null>;
  avisar: (id: string) => Promise<void>;
  sentar: (id: string, mesaNumero: number) => Promise<void>;
  cancelar: (id: string) => Promise<void>;
  liberarMesa: (numero: number) => Promise<void>;
}

export const useEsperas = (branchId: string | null): UseEsperas => {
  const live = supabaseConfigurado && isRealBranchId(branchId);
  const cantidadMesas = useConfigStore((s) => s.cantidadMesas);

  const demoEsperas = useEsperaStore((s) => s.esperas);
  const demoMesas = useEsperaStore((s) => s.mesas);
  const seed = useEsperaStore((s) => s.seedSiVacio);
  const setMesasCount = useEsperaStore((s) => s.setMesasCount);
  const demoAdd = useEsperaStore((s) => s.agregarEspera);
  const demoChange = useEsperaStore((s) => s.cambiarEstado);
  const demoLiberar = useEsperaStore((s) => s.liberarMesa);

  const [liveEsperas, setLiveEsperas] = useState<EsperaView[]>([]);
  const [liveMesas, setLiveMesas] = useState<MesaView[]>([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (!live || !branchId) return;
    const [e, m] = await Promise.all([
      fetchTodayEsperas(branchId),
      fetchMesas(branchId),
    ]);
    setLiveEsperas(e);
    setLiveMesas(m);
    setReady(true);
  }, [live, branchId]);

  useEffect(() => {
    if (!live || !branchId) {
      if (!supabaseConfigurado) {
        seed(cantidadMesas);
        setMesasCount(cantidadMesas);
      }
      setReady(true);
      return;
    }
    setReady(false);
    void (async () => {
      await syncMesas(branchId, cantidadMesas);
      await reload();
    })();
    const unsub = subscribeEsperas(branchId, reload);
    const onWake = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    const iv = window.setInterval(() => void reload(), 30_000);
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
      window.clearInterval(iv);
    };
  }, [live, branchId, seed, reload, cantidadMesas, setMesasCount]);

  const crearEspera = async (
    nombre: string,
    personas: number,
    employee?: EmployeeRef,
  ) => {
    if (!live || !branchId) {
      return demoAdd(nombre, personas, employee?.nombre ?? null);
    }
    const created = await insertEspera({
      branchId,
      nombre,
      personas,
      employeeId: employee?.id,
    });
    if (created) setLiveEsperas((prev) => [created, ...prev]);
    return created;
  };

  const avisar = async (id: string) => {
    if (!live) {
      demoChange(id, "avisado");
      return;
    }
    await updateEsperaStatus(id, "avisado");
    await reload();
  };

  const sentar = async (id: string, mesaNumero: number) => {
    if (!live || !branchId) {
      demoChange(id, "sentado", mesaNumero);
      return;
    }
    await updateEsperaStatus(id, "sentado", mesaNumero);
    await setMesaEstado(branchId, mesaNumero, "ocupada", id);
    await reload();
  };

  const cancelar = async (id: string) => {
    if (!live) {
      demoChange(id, "cancelado");
      return;
    }
    await updateEsperaStatus(id, "cancelado");
    await reload();
  };

  const liberarMesa = async (numero: number) => {
    if (!live || !branchId) {
      demoLiberar(numero);
      return;
    }
    await setMesaEstado(branchId, numero, "libre", null);
    await reload();
  };

  return {
    esperas: live ? liveEsperas : demoEsperas,
    mesas: live ? liveMesas : demoMesas,
    ready,
    live,
    crearEspera,
    avisar,
    sentar,
    cancelar,
    liberarMesa,
  };
};

// Re-export for callers that need status type
export type { EsperaStatus };
