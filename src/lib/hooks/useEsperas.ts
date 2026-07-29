"use client";

import { useCallback, useEffect, useState } from "react";
import { useEsperaStore } from "@/lib/store/espera-store";
import { useConfigStore } from "@/lib/store/config-store";
import { supabaseConfigurado } from "@/lib/supabase/config";
import {
  isRealBranchId,
  fetchTodayEsperas,
  fetchTodayReservas,
  fetchMesas,
  syncMesas,
  insertEspera,
  insertReserva,
  updateEsperaStatus,
  updateReservaStatus,
  setMesaEstado,
  setMesaCapacidad,
  expirarReservasVencidas,
  subscribeEsperas,
} from "@/lib/data/espera";
import type { EsperaView, MesaView, ReservaView } from "@/lib/types";
import { staffEsperaCancelIds } from "@/lib/store/espera-alerts-store";

type EmployeeRef = { id: string; nombre: string } | null;

export interface UseEsperas {
  esperas: EsperaView[];
  mesas: MesaView[];
  reservas: ReservaView[];
  ready: boolean;
  live: boolean;
  crearEspera: (
    nombre: string,
    personas: number,
    employee?: EmployeeRef,
  ) => Promise<EsperaView | null>;
  crearReserva: (args: {
    nombre: string;
    personas: number;
    mesaNumero: number;
    horario: string;
    graciaMinutos: 15 | 20;
    employee?: EmployeeRef;
  }) => Promise<ReservaView | null>;
  avisar: (id: string) => Promise<void>;
  sentar: (id: string, mesasNumeros: number[]) => Promise<void>;
  cancelar: (id: string) => Promise<void>;
  sentarReserva: (id: string) => Promise<void>;
  cancelarReserva: (id: string) => Promise<void>;
  liberarMesa: (numero: number) => Promise<void>;
  setCapacidad: (numero: number, capacidad: number) => Promise<void>;
}

export const useEsperas = (branchId: string | null): UseEsperas => {
  const live = supabaseConfigurado && isRealBranchId(branchId);
  const cantidadMesas = useConfigStore((s) => s.cantidadMesas);

  const demoEsperas = useEsperaStore((s) => s.esperas);
  const demoMesas = useEsperaStore((s) => s.mesas);
  const demoReservas = useEsperaStore((s) => s.reservas);
  const seed = useEsperaStore((s) => s.seedSiVacio);
  const setMesasCount = useEsperaStore((s) => s.setMesasCount);
  const demoAdd = useEsperaStore((s) => s.agregarEspera);
  const demoChange = useEsperaStore((s) => s.cambiarEstado);
  const demoLiberar = useEsperaStore((s) => s.liberarMesa);
  const demoSetCapacidad = useEsperaStore((s) => s.setCapacidad);
  const demoAddReserva = useEsperaStore((s) => s.agregarReserva);
  const demoSentarReserva = useEsperaStore((s) => s.sentarReserva);
  const demoCancelarReserva = useEsperaStore((s) => s.cancelarReserva);
  const demoExpirar = useEsperaStore((s) => s.expirarReservasDemo);

  const [liveEsperas, setLiveEsperas] = useState<EsperaView[]>([]);
  const [liveMesas, setLiveMesas] = useState<MesaView[]>([]);
  const [liveReservas, setLiveReservas] = useState<ReservaView[]>([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (!live || !branchId) return;
    await expirarReservasVencidas(branchId);
    const [e, m, r] = await Promise.all([
      fetchTodayEsperas(branchId),
      fetchMesas(branchId),
      fetchTodayReservas(branchId),
    ]);
    setLiveEsperas(e);
    setLiveMesas(m);
    setLiveReservas(r);
    setReady(true);
  }, [live, branchId]);

  useEffect(() => {
    if (!live || !branchId) {
      if (!supabaseConfigurado) {
        seed(cantidadMesas);
        setMesasCount(cantidadMesas);
        demoExpirar();
      }
      setReady(true);
      const demoIv = window.setInterval(() => demoExpirar(), 15_000);
      return () => window.clearInterval(demoIv);
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
    const iv = window.setInterval(() => void reload(), 5_000);
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
      window.clearInterval(iv);
    };
  }, [
    live,
    branchId,
    seed,
    reload,
    cantidadMesas,
    setMesasCount,
    demoExpirar,
  ]);

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

  const crearReserva = async (args: {
    nombre: string;
    personas: number;
    mesaNumero: number;
    horario: string;
    graciaMinutos: 15 | 20;
    employee?: EmployeeRef;
  }) => {
    if (!live || !branchId) {
      return demoAddReserva({
        ...args,
        empleado: args.employee?.nombre ?? null,
      });
    }
    const created = await insertReserva({
      branchId,
      nombre: args.nombre,
      personas: args.personas,
      mesaNumero: args.mesaNumero,
      horario: args.horario,
      graciaMinutos: args.graciaMinutos,
      employeeId: args.employee?.id,
    });
    await reload();
    return created;
  };

  const avisar = async (id: string) => {
    if (!live) {
      demoChange(id, "avisado");
      return;
    }
    await updateEsperaStatus(id, "avisado");
    void fetch("/api/push/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ esperaId: id }),
    }).catch(() => {});
    await reload();
  };

  const sentar = async (id: string, mesasNumeros: number[]) => {
    const nums = [...new Set(mesasNumeros)].filter((n) => n >= 1).sort((a, b) => a - b);
    if (!nums.length) return;
    const primaria = nums[0];
    if (!live || !branchId) {
      demoChange(id, "sentado", primaria, nums);
      return;
    }
    await updateEsperaStatus(id, "sentado", primaria);
    for (const n of nums) {
      await setMesaEstado(branchId, n, "ocupada", {
        esperaId: id,
        reservaId: null,
      });
    }
    await reload();
  };

  const cancelar = async (id: string) => {
    staffEsperaCancelIds.add(id);
    if (!live) {
      demoChange(id, "cancelado");
      return;
    }
    await updateEsperaStatus(id, "cancelado");
    await reload();
  };

  const sentarReserva = async (id: string) => {
    if (!live || !branchId) {
      demoSentarReserva(id);
      return;
    }
    const reserva = liveReservas.find((r) => r.id === id);
    if (!reserva) return;
    await updateReservaStatus(id, "sentada");
    await setMesaEstado(branchId, reserva.mesaNumero, "ocupada", {
      reservaId: id,
      esperaId: null,
    });
    await reload();
  };

  const cancelarReserva = async (id: string) => {
    if (!live || !branchId) {
      demoCancelarReserva(id);
      return;
    }
    const reserva = liveReservas.find((r) => r.id === id);
    await updateReservaStatus(id, "cancelada");
    if (reserva) {
      await setMesaEstado(branchId, reserva.mesaNumero, "libre", {
        reservaId: null,
        esperaId: null,
      });
    }
    await reload();
  };

  const liberarMesa = async (numero: number) => {
    if (!live || !branchId) {
      demoLiberar(numero);
      return;
    }
    const mesa = liveMesas.find((m) => m.numero === numero);
    if (mesa?.reservaId && mesa.estado === "reservada") {
      await updateReservaStatus(mesa.reservaId, "cancelada");
      await setMesaEstado(branchId, numero, "libre");
      await reload();
      return;
    }
    // Si el grupo ocupaba varias mesas, liberar todas las del mismo espera.
    if (mesa?.esperaId && mesa.estado === "ocupada") {
      const mismas = liveMesas.filter(
        (m) => m.esperaId === mesa.esperaId && m.estado === "ocupada",
      );
      for (const m of mismas) {
        await setMesaEstado(branchId, m.numero, "libre");
      }
      await reload();
      return;
    }
    await setMesaEstado(branchId, numero, "libre");
    await reload();
  };

  const setCapacidad = async (numero: number, capacidad: number) => {
    if (!live || !branchId) {
      demoSetCapacidad(numero, capacidad);
      return;
    }
    await setMesaCapacidad(branchId, numero, capacidad);
    await reload();
  };

  return {
    esperas: live ? liveEsperas : demoEsperas,
    mesas: live ? liveMesas : demoMesas,
    reservas: live ? liveReservas : demoReservas,
    ready,
    live,
    crearEspera,
    crearReserva,
    avisar,
    sentar,
    cancelar,
    sentarReserva,
    cancelarReserva,
    liberarMesa,
    setCapacidad,
  };
};

export type { EsperaStatus } from "@/lib/types";
