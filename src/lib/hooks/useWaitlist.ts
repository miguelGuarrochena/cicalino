"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { throttled } from "@/lib/realtime";
import { notifyCustomer, type NotifyResult } from "@/lib/notify";
import { useWaitlistStore } from "@/lib/store/waitlist-store";
import { useConfigStore } from "@/lib/store/config-store";
import { supabaseConfigured } from "@/lib/supabase/config";
import {
  isRealBranchId,
  fetchTodayWaitlist,
  fetchTodayReservations,
  fetchTables,
  syncTables,
  insertWaitlistEntry,
  insertReservation,
  seatWalkIn,
  updateWaitlistStatus,
  updateReservationStatus,
  deleteWaitlistEntry,
  setTableState,
  setTableCapacity,
  expireOverdueReservations,
  subscribeWaitlist,
} from "@/lib/data/waitlist";
import type { WaitlistView, TableView, ReservationView } from "@/lib/types";
import { reservationTables } from "@/lib/reservations";
import { staffWaitlistCancelIds } from "@/lib/store/waitlist-alerts-store";

type EmployeeRef = { id: string; nombre: string } | null;

export interface UseWaitlist {
  esperas: WaitlistView[];
  mesas: TableView[];
  reservas: ReservationView[];
  ready: boolean;
  live: boolean;
  crearEspera: (
    nombre: string,
    personas: number,
    employee?: EmployeeRef,
  ) => Promise<WaitlistView | null>;
  crearReserva: (args: {
    nombre: string;
    personas: number;
    mesaNumeros: number[];
    horario: string;
    graciaMinutos: 15 | 20;
    employee?: EmployeeRef;
  }) => Promise<ReservationView | null>;
  avisar: (id: string) => Promise<NotifyResult | null>;
  reavisar: (id: string) => Promise<NotifyResult>;
  sentar: (id: string, mesasNumeros: number[]) => Promise<void>;
  cancelar: (id: string) => Promise<void>;
  borrarEspera: (id: string) => Promise<void>;
  sentarReserva: (id: string) => Promise<void>;
  cancelarReserva: (id: string) => Promise<void>;
  liberarMesa: (
    numero: number,
    opts?: { soloEsta?: boolean },
  ) => Promise<void>;
  ocuparMesas: (args: {
    mesaNumeros: number[];
    nombre?: string;
    personas?: number;
    employee?: EmployeeRef;
  }) => Promise<WaitlistView | null>;
  setCapacidad: (numero: number, capacidad: number) => Promise<void>;
  sincronizarCantidadMesas: () => Promise<void>;
}

export const useWaitlist = (branchId: string | null): UseWaitlist => {
  const live = supabaseConfigured && isRealBranchId(branchId);
  const cantidadMesas = useConfigStore((s) => s.cantidadMesas);

  const demoEsperas = useWaitlistStore((s) => s.esperas);
  const demoMesas = useWaitlistStore((s) => s.mesas);
  const demoReservas = useWaitlistStore((s) => s.reservas);
  const seed = useWaitlistStore((s) => s.seedSiVacio);
  const setMesasCount = useWaitlistStore((s) => s.setMesasCount);
  const demoAdd = useWaitlistStore((s) => s.agregarEspera);
  const demoChange = useWaitlistStore((s) => s.cambiarEstado);
  const demoLiberar = useWaitlistStore((s) => s.liberarMesa);
  const demoSetCapacidad = useWaitlistStore((s) => s.setCapacidad);
  const demoAddReserva = useWaitlistStore((s) => s.agregarReserva);
  const demoSentarReserva = useWaitlistStore((s) => s.sentarReserva);
  const demoCancelarReserva = useWaitlistStore((s) => s.cancelarReserva);
  const demoEliminar = useWaitlistStore((s) => s.eliminarEspera);
  const demoReavisar = useWaitlistStore((s) => s.reavisarEspera);
  const demoExpirar = useWaitlistStore((s) => s.expirarReservasDemo);
  const demoWalkIn = useWaitlistStore((s) => s.ocuparWalkIn);

  const [liveEsperas, setLiveEsperas] = useState<WaitlistView[]>([]);
  const [liveMesas, setLiveMesas] = useState<TableView[]>([]);
  const [liveReservas, setLiveReservas] = useState<ReservationView[]>([]);
  const [ready, setReady] = useState(false);

  const expire = useMemo(
    () =>
      throttled(
        () => (branchId ? expireOverdueReservations(branchId) : undefined),
        60_000,
      ),
    [branchId],
  );

  const reload = useCallback(async () => {
    if (!live || !branchId) return;
    expire();
    const [e, m, r] = await Promise.all([
      fetchTodayWaitlist(branchId),
      fetchTables(branchId),
      fetchTodayReservations(branchId),
    ]);
    setLiveEsperas(e);
    setLiveMesas(m);
    setLiveReservas(r);
    setReady(true);
  }, [live, branchId, expire]);

  useEffect(() => {
    if (!live || !branchId) {
      if (!supabaseConfigured) {
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
      await syncTables(branchId, cantidadMesas);
      await reload();
    })();
    const sub = subscribeWaitlist(branchId, reload);
    const onWake = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);

    let ticks = 0;
    const iv = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      ticks++;
      if (ticks % (sub.isHealthy() ? 4 : 1) === 0) void reload();
    }, 5_000);

    return () => {
      sub.unsubscribe();
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
    setMesasCount,
    demoExpirar,
  ]);

  const sincronizarCantidadMesas = async () => {
    if (!live || !branchId) {
      setMesasCount(cantidadMesas);
      return;
    }
    await syncTables(branchId, cantidadMesas);
    await reload();
  };

  const crearEspera = async (
    nombre: string,
    personas: number,
    employee?: EmployeeRef,
  ) => {
    if (!live || !branchId) {
      return demoAdd(nombre, personas, employee?.nombre ?? null);
    }
    const created = await insertWaitlistEntry({
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
    mesaNumeros: number[];
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
    const created = await insertReservation({
      branchId,
      nombre: args.nombre,
      personas: args.personas,
      mesaNumeros: args.mesaNumeros,
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
      return null;
    }
    await updateWaitlistStatus(id, "avisado");
    const r = await notifyCustomer({ esperaId: id });
    await reload();
    return r;
  };

  const reavisar = async (id: string) => {
    if (!live) {
      demoReavisar(id);
      return { ok: true, delivered: 0 };
    }
    const r = await notifyCustomer({ esperaId: id });
    await reload();
    return r;
  };

  const sentar = async (id: string, mesasNumeros: number[]) => {
    const nums = [...new Set(mesasNumeros)].filter((n) => n >= 1).sort((a, b) => a - b);
    if (!nums.length) return;
    const primaria = nums[0];
    const antes = (live ? liveEsperas : demoEsperas).find((e) => e.id === id);
    const veniaEsperando = antes?.estado === "esperando";
    if (!live || !branchId) {
      demoChange(id, "sentado", primaria, nums);
      return;
    }
    await updateWaitlistStatus(id, "sentado", primaria);
    for (const n of nums) {
      await setTableState(branchId, n, "ocupada", {
        esperaId: id,
        reservaId: null,
      });
    }
    if (veniaEsperando) void notifyCustomer({ esperaId: id });
    await reload();
  };

  const cancelar = async (id: string) => {
    staffWaitlistCancelIds.add(id);
    if (!live) {
      demoChange(id, "cancelado");
      return;
    }
    await updateWaitlistStatus(id, "cancelado");
    await reload();
  };

  const borrarEspera = async (id: string) => {
    if (!live) {
      demoEliminar(id);
      return;
    }
    await deleteWaitlistEntry(id);
    setLiveEsperas((prev) => prev.filter((e) => e.id !== id));
    await reload();
  };

  const sentarReserva = async (id: string) => {
    if (!live || !branchId) {
      demoSentarReserva(id);
      return;
    }
    const reserva = liveReservas.find((r) => r.id === id);
    if (!reserva) return;
    await updateReservationStatus(id, "sentada");
    for (const n of reservationTables(reserva)) {
      await setTableState(branchId, n, "ocupada", {
        reservaId: id,
        esperaId: null,
      });
    }
    await reload();
  };

  const cancelarReserva = async (id: string) => {
    if (!live || !branchId) {
      demoCancelarReserva(id);
      return;
    }
    await updateReservationStatus(id, "cancelada");
    await reload();
  };

  const liberarMesa = async (
    numero: number,
    opts?: { soloEsta?: boolean },
  ) => {
    if (!live || !branchId) {
      demoLiberar(numero, opts);
      return;
    }
    const mesa = liveMesas.find((m) => m.numero === numero);
    if (opts?.soloEsta) {
      await setTableState(branchId, numero, "libre");
      await reload();
      return;
    }
    if (mesa?.esperaId && mesa.estado === "ocupada") {
      const mismas = liveMesas.filter(
        (m) => m.esperaId === mesa.esperaId && m.estado === "ocupada",
      );
      for (const m of mismas) {
        await setTableState(branchId, m.numero, "libre");
      }
      await reload();
      return;
    }
    if (mesa?.reservaId && mesa.estado === "ocupada") {
      const mismas = liveMesas.filter(
        (m) => m.reservaId === mesa.reservaId && m.estado === "ocupada",
      );
      for (const m of mismas) {
        await setTableState(branchId, m.numero, "libre");
      }
      await reload();
      return;
    }
    await setTableState(branchId, numero, "libre");
    await reload();
  };

  const setCapacidad = async (numero: number, capacidad: number) => {
    if (!live || !branchId) {
      demoSetCapacidad(numero, capacidad);
      return;
    }
    await setTableCapacity(branchId, numero, capacidad);
    await reload();
  };

  const ocuparMesas = async (args: {
    mesaNumeros: number[];
    nombre?: string;
    personas?: number;
    employee?: EmployeeRef;
  }) => {
    if (!live || !branchId) {
      return demoWalkIn({
        mesaNumeros: args.mesaNumeros,
        nombre: args.nombre,
        personas: args.personas,
        empleado: args.employee?.nombre ?? null,
      });
    }
    const created = await seatWalkIn({
      branchId,
      mesaNumeros: args.mesaNumeros,
      nombre: args.nombre,
      personas: args.personas,
      employeeId: args.employee?.id,
    });
    await reload();
    return created;
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
    reavisar,
    sentar,
    cancelar,
    borrarEspera,
    sentarReserva,
    cancelarReserva,
    liberarMesa,
    ocuparMesas,
    setCapacidad,
    sincronizarCantidadMesas,
  };
};

export type { WaitlistStatus } from "@/lib/types";
