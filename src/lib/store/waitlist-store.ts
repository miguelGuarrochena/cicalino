import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabaseConfigured } from "@/lib/supabase/config";
import type {
  WaitlistStatus,
  WaitlistView,
  TableView,
  ReservationStatus,
  ReservationView,
} from "@/lib/types";
import { conflictingReservation } from "@/lib/reservations";

interface WaitlistState {
  esperas: WaitlistView[];
  mesas: TableView[];
  reservas: ReservationView[];
  seedSiVacio: (tableCount?: number) => void;
  setMesasCount: (n: number) => void;
  agregarEspera: (
    name: string,
    partySize: number,
    employee?: string | null,
  ) => WaitlistView;
  cambiarEstado: (
    id: string,
    status: WaitlistStatus,
    tableNumber?: number | null,
    mesasExtra?: number[],
  ) => void;
  liberarMesa: (
    number: number,
    opts?: { soloEsta?: boolean },
  ) => void;
  ocuparMesa: (number: number, waitlistId: string) => void;
  ocuparWalkIn: (args: {
    tableNumbers: number[];
    name?: string;
    partySize?: number;
    employee?: string | null;
  }) => WaitlistView | null;
  setCapacidad: (number: number, capacity: number) => void;
  agregarReserva: (args: {
    name: string;
    partySize: number;
    tableNumbers: number[];
    scheduledAt: string;
    graceMinutes: 15 | 20;
    employee?: string | null;
  }) => ReservationView | null;
  sentarReserva: (id: string) => void;
  cancelarReserva: (id: string) => void;
  eliminarEspera: (id: string) => void;
  reavisarEspera: (id: string) => void;
  expirarReservasDemo: () => void;
}

const iso = (minsAgo = 0) =>
  new Date(Date.now() - minsAgo * 60_000).toISOString();

const buildTables = (n: number, prev: TableView[] = []): TableView[] => {
  const map = new Map(prev.map((m) => [m.number, m]));
  return Array.from({ length: Math.max(1, n) }, (_, i) => {
    const num = i + 1;
    const old = map.get(num);
    if (old) {
      return { ...old, capacity: old.capacity ?? 4 };
    }
    return {
      id: `mesa-demo-${num}`,
      number: num,
      status: "libre" as const,
      capacity: 4,
      waitlistId: null,
      reservationId: null,
    };
  });
};

export const useWaitlistStore = create<WaitlistState>()(
  persist(
    (set, get) => ({
      esperas: [],
      mesas: [],
      reservas: [],

      seedSiVacio: (tableCount = 10) => {
        if (get().esperas.length || get().mesas.length || get().reservas.length) {
          if (!get().mesas.length) {
            set({ mesas: buildTables(tableCount) });
          }
          return;
        }
        const mesas = buildTables(tableCount);
        const reservaDemo: ReservationView = {
          id: "res-demo-1",
          name: "Martínez",
          partySize: 3,
          tableNumber: 5,
          tableNumbers: [5],
          scheduledAt: new Date(Date.now() + 90 * 60_000).toISOString(),
          graceMinutes: 15,
          status: "activa",
          createdAt: iso(30),
          seatedAt: null,
          cancelledAt: null,
          expiredAt: null,
          employee: "Lucía",
        };
        const reservaDemoPronto: ReservationView = {
          id: "res-demo-2",
          name: "Sosa",
          partySize: 2,
          tableNumber: 7,
          tableNumbers: [7],
          scheduledAt: new Date(Date.now() + 35 * 60_000).toISOString(),
          graceMinutes: 15,
          status: "activa",
          createdAt: iso(45),
          seatedAt: null,
          cancelledAt: null,
          expiredAt: null,
          employee: "Marcos",
        };
        mesas[0] = {
          ...mesas[0],
          status: "ocupada",
          waitlistId: "esp-demo-old",
          reservationId: null,
        };
        mesas[2] = {
          ...mesas[2],
          status: "ocupada",
          waitlistId: "esp-demo-old2",
          reservationId: null,
        };
        set({
          mesas,
          reservas: [reservaDemoPronto, reservaDemo],
          esperas: [
            {
              id: "esp-demo-1",
              name: "García",
              partySize: 4,
              status: "esperando",
              tableNumber: null,
              qrToken: "11111111-1111-4111-8111-111111111111",
              createdAt: iso(12),
              notifiedAt: null,
              seatedAt: null,
              cancelledAt: null,
              seenAt: iso(11),
              employee: "Lucía",
            },
            {
              id: "esp-demo-2",
              name: "López",
              partySize: 2,
              status: "avisado",
              tableNumber: null,
              qrToken: "22222222-2222-4222-8222-222222222222",
              createdAt: iso(25),
              notifiedAt: iso(2),
              seatedAt: null,
              cancelledAt: null,
              seenAt: iso(24),
              employee: "Marcos",
            },
          ],
        });
      },

      setMesasCount: (n) => set((s) => ({ mesas: buildTables(n, s.mesas) })),

      agregarEspera: (name, partySize, employee = null) => {
        const e: WaitlistView = {
          id: crypto.randomUUID(),
          name: name.trim() || "Grupo",
          partySize: Math.max(1, partySize),
          status: "esperando",
          tableNumber: null,
          qrToken: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          notifiedAt: null,
          seatedAt: null,
          cancelledAt: null,
          seenAt: null,
          employee,
        };
        set((s) => ({ esperas: [e, ...s.esperas] }));
        return e;
      },

      cambiarEstado: (id, status, tableNumber = null, mesasExtra = []) =>
        set((s) => {
          const now = new Date().toISOString();
          const esperas = s.esperas.map((e) => {
            if (e.id !== id) return e;
            const next = { ...e, status };
            if (status === "avisado") next.notifiedAt = now;
            if (status === "sentado") {
              next.seatedAt = now;
              next.tableNumber = tableNumber ?? e.tableNumber;
              if (!next.notifiedAt) next.notifiedAt = now;
            }
            if (status === "cancelado") next.cancelledAt = now;
            return next;
          });
          let mesas = s.mesas;
          if (status === "sentado" && tableNumber) {
            const nums = new Set([tableNumber, ...mesasExtra]);
            mesas = s.mesas.map((m) =>
              nums.has(m.number)
                ? {
                    ...m,
                    status: "ocupada" as const,
                    waitlistId: id,
                    reservationId: null,
                  }
                : m,
            );
          }
          return { esperas, mesas };
        }),

      liberarMesa: (number, opts) =>
        set((s) => {
          const mesa = s.mesas.find((m) => m.number === number);
          const reservas = s.reservas;
          if (opts?.soloEsta) {
            return {
              reservas,
              mesas: s.mesas.map((m) =>
                m.number === number
                  ? {
                      ...m,
                      status: "libre" as const,
                      waitlistId: null,
                      reservationId: null,
                    }
                  : m,
              ),
            };
          }
          const waitlistId =
            mesa?.status === "ocupada" ? mesa.waitlistId : null;
          const reservaOcupadaId =
            mesa?.status === "ocupada" ? mesa.reservationId : null;
          return {
            reservas,
            mesas: s.mesas.map((m) =>
              (waitlistId && m.waitlistId === waitlistId) ||
              (reservaOcupadaId && m.reservationId === reservaOcupadaId) ||
              m.number === number
                ? {
                    ...m,
                    status: "libre" as const,
                    waitlistId: null,
                    reservationId: null,
                  }
                : m,
            ),
          };
        }),

      ocuparMesa: (number, waitlistId) =>
        set((s) => ({
          mesas: s.mesas.map((m) =>
            m.number === number
              ? {
                  ...m,
                  status: "ocupada" as const,
                  waitlistId,
                  reservationId: null,
                }
              : m,
          ),
        })),

      ocuparWalkIn: ({
        tableNumbers,
        name,
        partySize,
        employee = null,
      }) => {
        const nums = [...new Set(tableNumbers)]
          .filter((n) => n >= 1)
          .sort((a, b) => a - b);
        if (!nums.length) return null;
        const pick = get().mesas.filter((m) => nums.includes(m.number));
        if (pick.length !== nums.length) return null;
        if (pick.some((m) => m.status !== "libre")) return null;
        const cap = pick.reduce((s, m) => s + (m.capacity ?? 4), 0);
        const now = new Date().toISOString();
        const primaria = nums[0];
        const e: WaitlistView = {
          id: crypto.randomUUID(),
          name: (name ?? "").trim() || "Walk-in",
          partySize: Math.max(1, partySize ?? cap),
          status: "sentado",
          tableNumber: primaria,
          qrToken: crypto.randomUUID(),
          createdAt: now,
          notifiedAt: null,
          seatedAt: now,
          cancelledAt: null,
          seenAt: null,
          employee,
        };
        const setNums = new Set(nums);
        set((s) => ({
          esperas: [e, ...s.esperas],
          mesas: s.mesas.map((m) =>
            setNums.has(m.number)
              ? {
                  ...m,
                  status: "ocupada" as const,
                  waitlistId: e.id,
                  reservationId: null,
                }
              : m,
          ),
        }));
        return e;
      },

      setCapacidad: (number, capacity) =>
        set((s) => ({
          mesas: s.mesas.map((m) =>
            m.number === number
              ? {
                  ...m,
                  capacity: Math.max(1, Math.min(50, Math.round(capacity) || 4)),
                }
              : m,
          ),
        })),

      agregarReserva: ({
        name,
        partySize,
        tableNumbers,
        scheduledAt,
        graceMinutes,
        employee = null,
      }) => {
        const nums = [...new Set(tableNumbers)]
          .filter((n) => n >= 1)
          .sort((a, b) => a - b);
        if (!nums.length) return null;
        const pick = get().mesas.filter((m) => nums.includes(m.number));
        if (pick.length !== nums.length) return null;
        const cap = pick.reduce((s, m) => s + (m.capacity ?? 4), 0);
        if (cap < Math.max(1, partySize)) return null;
        if (conflictingReservation(nums, scheduledAt, get().reservas)) return null;
        const primaria = nums[0];
        const r: ReservationView = {
          id: crypto.randomUUID(),
          name: name.trim() || "Reserva",
          partySize: Math.max(1, partySize),
          tableNumber: primaria,
          tableNumbers: nums,
          scheduledAt,
          graceMinutes,
          status: "activa",
          createdAt: new Date().toISOString(),
          seatedAt: null,
          cancelledAt: null,
          expiredAt: null,
          employee,
        };
        set((s) => ({
          reservas: [...s.reservas, r].sort((a, b) =>
            a.scheduledAt.localeCompare(b.scheduledAt),
          ),
        }));
        return r;
      },

      sentarReserva: (id) =>
        set((s) => {
          const r = s.reservas.find((x) => x.id === id);
          if (!r || r.status !== "activa") return s;
          const now = new Date().toISOString();
          const nums = new Set(
            r.tableNumbers?.length ? r.tableNumbers : [r.tableNumber],
          );
          return {
            reservas: s.reservas.map((x) =>
              x.id === id
                ? { ...x, status: "sentada" as const, seatedAt: now }
                : x,
            ),
            mesas: s.mesas.map((m) =>
              nums.has(m.number) || m.reservationId === id
                ? {
                    ...m,
                    status: "ocupada" as const,
                    reservationId: id,
                    waitlistId: null,
                  }
                : m,
            ),
          };
        }),

      cancelarReserva: (id) =>
        set((s) => {
          const r = s.reservas.find((x) => x.id === id);
          if (!r || r.status !== "activa") return s;
          const now = new Date().toISOString();
          return {
            reservas: s.reservas.map((x) =>
              x.id === id
                ? { ...x, status: "cancelada" as const, cancelledAt: now }
                : x,
            ),
          };
        }),

      eliminarEspera: (id) =>
        set((s) => ({
          esperas: s.esperas.filter((e) => e.id !== id),
          mesas: s.mesas.map((m) =>
            m.waitlistId === id
              ? {
                  ...m,
                  status: "libre" as const,
                  waitlistId: null,
                  reservationId: null,
                }
              : m,
          ),
        })),

      reavisarEspera: (id) =>
        set((s) => {
          const now = new Date().toISOString();
          return {
            esperas: s.esperas.map((e) => {
              if (e.id !== id) return e;
              if (e.status !== "esperando" && e.status !== "avisado") return e;
              return {
                ...e,
                status: e.status === "esperando" ? ("avisado" as const) : e.status,
                notifiedAt: now,
              };
            }),
          };
        }),

      expirarReservasDemo: () =>
        set((s) => {
          const now = Date.now();
          let changed = false;
          const reservas = s.reservas.map((r) => {
            if (r.status !== "activa") return r;
            const limite =
              new Date(r.scheduledAt).getTime() + r.graceMinutes * 60_000;
            if (now <= limite) return r;
            changed = true;
            return {
              ...r,
              status: "expirada" as ReservationStatus,
              expiredAt: new Date().toISOString(),
            };
          });
          if (!changed) return s;
          return { reservas };
        }),
    }),
    {
      name: "cicalino-espera-demo-v4",
      skipHydration: true,
      partialize: (s) =>
        supabaseConfigured
          ? { esperas: [], mesas: [], reservas: [] }
          : { esperas: s.esperas, mesas: s.mesas, reservas: s.reservas },
    },
  ),
);
