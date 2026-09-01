"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { attachLiveRefresh, coalesced, throttled } from "@/lib/realtime";
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
  seatWaitlist,
  seatReservation,
  updateWaitlistStatus,
  updateReservationStatus,
  deleteWaitlistEntry,
  releaseTables,
  setTableCapacity,
  expireOverdueReservations,
  subscribeWaitlist,
} from "@/lib/data/waitlist";
import type {
  SeatWalkInResult,
  SeatPartyResult,
  NewReservationResult,
} from "@/lib/data/waitlist";
import type { DataError } from "@/lib/data/result";
import type { WaitlistView, TableView, ReservationView } from "@/lib/types";
import { staffWaitlistCancelIds } from "@/lib/store/waitlist-alerts-store";

type EmployeeRef = { id: string; name: string } | null;

export interface UseWaitlist {
  esperas: WaitlistView[];
  mesas: TableView[];
  reservas: ReservationView[];
  ready: boolean;
  live: boolean;
  /* Set when the last refresh failed. Same reasoning as useOrders: the lists
   * keep what they had rather than emptying out mid-service. */
  syncError: DataError | null;
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
  }) => Promise<NewReservationResult>;
  avisar: (id: string) => Promise<NotifyResult | null>;
  reavisar: (id: string) => Promise<NotifyResult>;
  sentar: (
    id: string,
    tableNumbers: number[],
    opts?: { forzar?: boolean },
  ) => Promise<SeatPartyResult>;
  cancelar: (id: string) => Promise<void>;
  borrarEspera: (id: string) => Promise<void>;
  sentarReserva: (id: string) => Promise<SeatPartyResult>;
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
  }) => Promise<SeatWalkInResult>;
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
  /* Igual que en useOrders: derivado, no guardado. */
  const [cargado, setCargado] = useState(false);
  const ready = !live || cargado;
  const [syncError, setSyncError] = useState<DataError | null>(null);

  const expire = useMemo(
    () =>
      throttled(
        () => (branchId ? expireOverdueReservations(branchId) : undefined),
        60_000,
      ),
    [branchId],
  );

  const recargar = useCallback(async () => {
    if (!live || !branchId) return;
    expire();
    const [e, m, r] = await Promise.all([
      fetchTodayWaitlist(branchId),
      fetchTables(branchId),
      fetchTodayReservations(branchId),
    ]);
    /* Each list keeps its last good value independently: one failing query
     * shouldn't blank the other two. */
    if (e.ok) setLiveEsperas(e.data);
    if (m.ok) setLiveMesas(m.data);
    if (r.ok) setLiveReservas(r.data);
    const fallo = [e, m, r].find((x) => !x.ok);
    setSyncError(fallo && !fallo.ok ? fallo.error : null);
    setCargado(true);
  }, [live, branchId, expire]);

  /* Las recargas que se pisan se unen en una.
   *
   * Cada acción de la sala recargaba dos veces: la de la propia acción y la
   * que rebota por realtime avisando del cambio que esa acción hizo. Con tres
   * consultas por recarga eran seis para un solo cambio.
   *
   * No se pierde ningún refresco: lo que llega durante una recarga en vuelo
   * deja marcado que hay que volver a mirar, y se corre una pasada más al
   * terminar. Importa para el caso multiusuario — si mientras yo recargo otro
   * mozo sienta un grupo, ese cambio entra en la pasada siguiente. */
  const reload = useMemo(() => coalesced(recargar), [recargar]);

  useEffect(() => {
    if (!live || !branchId) {
      if (!supabaseConfigured) {
        seed(tableCount);
        setMesasCount(tableCount);
        demoExpirar();
      }
      const demoIv = window.setInterval(() => demoExpirar(), 15_000);
      return () => window.clearInterval(demoIv);
    }
    void (async () => {
      await syncTables(branchId, tableCount);
      await reload();
    })();
    return attachLiveRefresh({
      subscribe: (onChange) => subscribeWaitlist(branchId, onChange),
      reload: () => void reload(),
      ticksSano: 4,
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps -- `tableCount`
       queda afuera a propósito. Se usa para sincronizar las mesas al entrar a
       la sucursal; agregarlo haría que cambiar la cantidad en Configuración
       desarme y rearme la suscripción de realtime y los intervalos. El caso de
       "cambió la cantidad" ya tiene su propia salida: sincronizarCantidadMesas. */
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
      const demo = demoAddReserva({
        ...args,
        employee: args.employee?.name ?? null,
      });
      return demo
        ? { ok: true as const, reserva: demo }
        : { ok: false as const, reason: "error" as const };
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

  const sentar = async (
    id: string,
    tableNumbers: number[],
    opts?: { forzar?: boolean },
  ): Promise<SeatPartyResult> => {
    const nums = [...new Set(tableNumbers)].filter((n) => n >= 1).sort((a, b) => a - b);
    if (!nums.length) return { ok: false, reason: "sin-mesas" };
    const primaria = nums[0];
    const antes = (live ? liveEsperas : demoEsperas).find((e) => e.id === id);
    const veniaEsperando = antes?.status === "esperando";
    if (!live || !branchId) {
      demoChange(id, "sentado", primaria, nums);
      return { ok: true };
    }
    const res = await seatWaitlist({
      branchId,
      waitlistId: id,
      tableNumbers: nums,
      forzar: opts?.forzar,
    });
    if (res.ok && veniaEsperando) void notifyCustomer({ waitlistId: id });
    await reload();
    return res;
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

  const sentarReserva = async (id: string): Promise<SeatPartyResult> => {
    if (!live || !branchId) {
      demoSentarReserva(id);
      return { ok: true };
    }
    const res = await seatReservation({ branchId, reservationId: id });
    await reload();
    return res;
  };

  const cancelarReserva = async (id: string) => {
    if (!live || !branchId) {
      demoCancelarReserva(id);
      return;
    }
    await updateReservationStatus(id, "cancelada");
    await reload();
  };

  /* Una sola llamada: la RPC resuelve la unión y la libera en una
   * transacción. Antes esto era un UPDATE por mesa desde el cliente, y una
   * caída a mitad de camino dejaba media unión liberada. */
  const liberarMesa = async (
    number: number,
    opts?: { soloEsta?: boolean },
  ) => {
    if (!live || !branchId) {
      demoLiberar(number, opts);
      return;
    }
    await releaseTables(branchId, number, { soloEsta: opts?.soloEsta });
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
      const demo = demoWalkIn({
        tableNumbers: args.tableNumbers,
        name: args.name,
        partySize: args.partySize,
        employee: args.employee?.name ?? null,
      });
      return demo
        ? { ok: true as const, espera: demo }
        : { ok: false as const, reason: "error" as const };
    }
    const res = await seatWalkIn({
      branchId,
      tableNumbers: args.tableNumbers,
      name: args.name,
      partySize: args.partySize,
      employeeId: args.employee?.id,
    });
    await reload();
    return res;
  };

  return {
    esperas: live ? liveEsperas : demoEsperas,
    mesas: live ? liveMesas : demoMesas,
    reservas: live ? liveReservas : demoReservas,
    ready,
    live,
    syncError: live ? syncError : null,
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
