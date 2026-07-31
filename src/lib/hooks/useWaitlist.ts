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

type EmployeeRef = { id: string; name: string } | null;

export interface UseWaitlist {
  esperas: WaitlistView[];
  mesas: TableView[];
  reservas: ReservationView[];
  ready: boolean;
  live: boolean;
  crearEspera: (
    name: string,
    partySize: number,
    employee?: EmployeeRef,
  ) => Promise<WaitlistView | null>;
  crearReserva: (args: {
    name: string;
    partySize: number;
    tableNumbers: number[];
    scheduledAt: string;
    graceMinutes: 15 | 20;
    employee?: EmployeeRef;
  }) => Promise<ReservationView | null>;
  avisar: (id: string) => Promise<NotifyResult | null>;
  reavisar: (id: string) => Promise<NotifyResult>;
  sentar: (id: string, tableNumbers: number[]) => Promise<void>;
  cancelar: (id: string) => Promise<void>;
  borrarEspera: (id: string) => Promise<void>;
  sentarReserva: (id: string) => Promise<void>;
  cancelarReserva: (id: string) => Promise<void>;
  liberarMesa: (
    number: number,
    opts?: { soloEsta?: boolean },
  ) => Promise<void>;
  ocuparMesas: (args: {
    tableNumbers: number[];
    name?: string;
    partySize?: number;
    employee?: EmployeeRef;
  }) => Promise<WaitlistView | null>;
  setCapacidad: (number: number, capacity: number) => Promise<void>;
  sincronizarCantidadMesas: () => Promise<void>;
}

export const useWaitlist = (branchId: string | null): UseWaitlist => {
  const live = supabaseConfigured && isRealBranchId(branchId);
  const tableCount = useConfigStore((s) => s.tableCount);

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
        seed(tableCount);
        setMesasCount(tableCount);
        demoExpirar();
      }
      setReady(true);
      const demoIv = window.setInterval(() => demoExpirar(), 15_000);
      return () => window.clearInterval(demoIv);
    }
    setReady(false);
    void (async () => {
      await syncTables(branchId, tableCount);
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
      setMesasCount(tableCount);
      return;
    }
    await syncTables(branchId, tableCount);
    await reload();
  };

  const crearEspera = async (
    name: string,
    partySize: number,
    employee?: EmployeeRef,
  ) => {
    if (!live || !branchId) {
      return demoAdd(name, partySize, employee?.name ?? null);
    }
    const created = await insertWaitlistEntry({
      branchId,
      name,
      partySize,
      employeeId: employee?.id,
    });
    if (created) setLiveEsperas((prev) => [created, ...prev]);
    return created;
  };

  const crearReserva = async (args: {
    name: string;
    partySize: number;
    tableNumbers: number[];
    scheduledAt: string;
    graceMinutes: 15 | 20;
    employee?: EmployeeRef;
  }) => {
    if (!live || !branchId) {
      return demoAddReserva({
        ...args,
        employee: args.employee?.name ?? null,
      });
    }
    const created = await insertReservation({
      branchId,
      name: args.name,
      partySize: args.partySize,
      tableNumbers: args.tableNumbers,
      scheduledAt: args.scheduledAt,
      graceMinutes: args.graceMinutes,
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
    const r = await notifyCustomer({ waitlistId: id });
    await reload();
    return r;
  };

  const reavisar = async (id: string) => {
    if (!live) {
      demoReavisar(id);
      return { ok: true, delivered: 0 };
    }
    const r = await notifyCustomer({ waitlistId: id });
    await reload();
    return r;
  };

  const sentar = async (id: string, tableNumbers: number[]) => {
    const nums = [...new Set(tableNumbers)].filter((n) => n >= 1).sort((a, b) => a - b);
    if (!nums.length) return;
    const primaria = nums[0];
    const antes = (live ? liveEsperas : demoEsperas).find((e) => e.id === id);
    const veniaEsperando = antes?.status === "esperando";
    if (!live || !branchId) {
      demoChange(id, "sentado", primaria, nums);
      return;
    }
    await updateWaitlistStatus(id, "sentado", primaria);
    for (const n of nums) {
      await setTableState(branchId, n, "ocupada", {
        waitlistId: id,
        reservationId: null,
      });
    }
    if (veniaEsperando) void notifyCustomer({ waitlistId: id });
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
        reservationId: id,
        waitlistId: null,
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
    number: number,
    opts?: { soloEsta?: boolean },
  ) => {
    if (!live || !branchId) {
      demoLiberar(number, opts);
      return;
    }
    const mesa = liveMesas.find((m) => m.number === number);
    if (opts?.soloEsta) {
      await setTableState(branchId, number, "libre");
      await reload();
      return;
    }
    if (mesa?.waitlistId && mesa.status === "ocupada") {
      const mismas = liveMesas.filter(
        (m) => m.waitlistId === mesa.waitlistId && m.status === "ocupada",
      );
      for (const m of mismas) {
        await setTableState(branchId, m.number, "libre");
      }
      await reload();
      return;
    }
    if (mesa?.reservationId && mesa.status === "ocupada") {
      const mismas = liveMesas.filter(
        (m) => m.reservationId === mesa.reservationId && m.status === "ocupada",
      );
      for (const m of mismas) {
        await setTableState(branchId, m.number, "libre");
      }
      await reload();
      return;
    }
    await setTableState(branchId, number, "libre");
    await reload();
  };

  const setCapacidad = async (number: number, capacity: number) => {
    if (!live || !branchId) {
      demoSetCapacidad(number, capacity);
      return;
    }
    await setTableCapacity(branchId, number, capacity);
    await reload();
  };

  const ocuparMesas = async (args: {
    tableNumbers: number[];
    name?: string;
    partySize?: number;
    employee?: EmployeeRef;
  }) => {
    if (!live || !branchId) {
      return demoWalkIn({
        tableNumbers: args.tableNumbers,
        name: args.name,
        partySize: args.partySize,
        employee: args.employee?.name ?? null,
      });
    }
    const created = await seatWalkIn({
      branchId,
      tableNumbers: args.tableNumbers,
      name: args.name,
      partySize: args.partySize,
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
