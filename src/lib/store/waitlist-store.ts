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
    nombre: string,
    personas: number,
    empleado?: string | null,
  ) => WaitlistView;
  cambiarEstado: (
    id: string,
    estado: WaitlistStatus,
    tableNumber?: number | null,
    mesasExtra?: number[],
  ) => void;
  liberarMesa: (
    numero: number,
    opts?: { soloEsta?: boolean },
  ) => void;
  ocuparMesa: (numero: number, waitlistId: string) => void;
  ocuparWalkIn: (args: {
    tableNumbers: number[];
    nombre?: string;
    personas?: number;
    empleado?: string | null;
  }) => WaitlistView | null;
  setCapacidad: (numero: number, capacidad: number) => void;
  agregarReserva: (args: {
    nombre: string;
    personas: number;
    tableNumbers: number[];
    horario: string;
    graceMinutes: 15 | 20;
    empleado?: string | null;
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
  const map = new Map(prev.map((m) => [m.numero, m]));
  return Array.from({ length: Math.max(1, n) }, (_, i) => {
    const num = i + 1;
    const old = map.get(num);
    if (old) {
      return { ...old, capacidad: old.capacidad ?? 4 };
    }
    return {
      id: `mesa-demo-${num}`,
      numero: num,
      estado: "libre" as const,
      capacidad: 4,
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
          nombre: "Martínez",
          personas: 3,
          tableNumber: 5,
          tableNumbers: [5],
          horario: new Date(Date.now() + 90 * 60_000).toISOString(),
          graceMinutes: 15,
          estado: "activa",
          createdAt: iso(30),
          seatedAt: null,
          cancelledAt: null,
          expiredAt: null,
          empleado: "Lucía",
        };
        const reservaDemoPronto: ReservationView = {
          id: "res-demo-2",
          nombre: "Sosa",
          personas: 2,
          tableNumber: 7,
          tableNumbers: [7],
          horario: new Date(Date.now() + 35 * 60_000).toISOString(),
          graceMinutes: 15,
          estado: "activa",
          createdAt: iso(45),
          seatedAt: null,
          cancelledAt: null,
          expiredAt: null,
          empleado: "Marcos",
        };
        mesas[0] = {
          ...mesas[0],
          estado: "ocupada",
          waitlistId: "esp-demo-old",
          reservationId: null,
        };
        mesas[2] = {
          ...mesas[2],
          estado: "ocupada",
          waitlistId: "esp-demo-old2",
          reservationId: null,
        };
        set({
          mesas,
          reservas: [reservaDemoPronto, reservaDemo],
          esperas: [
            {
              id: "esp-demo-1",
              nombre: "García",
              personas: 4,
              estado: "esperando",
              tableNumber: null,
              qrToken: "11111111-1111-4111-8111-111111111111",
              createdAt: iso(12),
              notifiedAt: null,
              seatedAt: null,
              cancelledAt: null,
              seenAt: iso(11),
              empleado: "Lucía",
            },
            {
              id: "esp-demo-2",
              nombre: "López",
              personas: 2,
              estado: "avisado",
              tableNumber: null,
              qrToken: "22222222-2222-4222-8222-222222222222",
              createdAt: iso(25),
              notifiedAt: iso(2),
              seatedAt: null,
              cancelledAt: null,
              seenAt: iso(24),
              empleado: "Marcos",
            },
          ],
        });
      },

      setMesasCount: (n) => set((s) => ({ mesas: buildTables(n, s.mesas) })),

      agregarEspera: (nombre, personas, empleado = null) => {
        const e: WaitlistView = {
          id: crypto.randomUUID(),
          nombre: nombre.trim() || "Grupo",
          personas: Math.max(1, personas),
          estado: "esperando",
          tableNumber: null,
          qrToken: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          notifiedAt: null,
          seatedAt: null,
          cancelledAt: null,
          seenAt: null,
          empleado,
        };
        set((s) => ({ esperas: [e, ...s.esperas] }));
        return e;
      },

      cambiarEstado: (id, estado, tableNumber = null, mesasExtra = []) =>
        set((s) => {
          const now = new Date().toISOString();
          const esperas = s.esperas.map((e) => {
            if (e.id !== id) return e;
            const next = { ...e, estado };
            if (estado === "avisado") next.notifiedAt = now;
            if (estado === "sentado") {
              next.seatedAt = now;
              next.tableNumber = tableNumber ?? e.tableNumber;
              if (!next.notifiedAt) next.notifiedAt = now;
            }
            if (estado === "cancelado") next.cancelledAt = now;
            return next;
          });
          let mesas = s.mesas;
          if (estado === "sentado" && tableNumber) {
            const nums = new Set([tableNumber, ...mesasExtra]);
            mesas = s.mesas.map((m) =>
              nums.has(m.numero)
                ? {
                    ...m,
                    estado: "ocupada" as const,
                    waitlistId: id,
                    reservationId: null,
                  }
                : m,
            );
          }
          return { esperas, mesas };
        }),

      liberarMesa: (numero, opts) =>
        set((s) => {
          const mesa = s.mesas.find((m) => m.numero === numero);
          const reservas = s.reservas;
          if (opts?.soloEsta) {
            return {
              reservas,
              mesas: s.mesas.map((m) =>
                m.numero === numero
                  ? {
                      ...m,
                      estado: "libre" as const,
                      waitlistId: null,
                      reservationId: null,
                    }
                  : m,
              ),
            };
          }
          const waitlistId =
            mesa?.estado === "ocupada" ? mesa.waitlistId : null;
          const reservaOcupadaId =
            mesa?.estado === "ocupada" ? mesa.reservationId : null;
          return {
            reservas,
            mesas: s.mesas.map((m) =>
              (waitlistId && m.waitlistId === waitlistId) ||
              (reservaOcupadaId && m.reservationId === reservaOcupadaId) ||
              m.numero === numero
                ? {
                    ...m,
                    estado: "libre" as const,
                    waitlistId: null,
                    reservationId: null,
                  }
                : m,
            ),
          };
        }),

      ocuparMesa: (numero, waitlistId) =>
        set((s) => ({
          mesas: s.mesas.map((m) =>
            m.numero === numero
              ? {
                  ...m,
                  estado: "ocupada" as const,
                  waitlistId,
                  reservationId: null,
                }
              : m,
          ),
        })),

      ocuparWalkIn: ({
        tableNumbers,
        nombre,
        personas,
        empleado = null,
      }) => {
        const nums = [...new Set(tableNumbers)]
          .filter((n) => n >= 1)
          .sort((a, b) => a - b);
        if (!nums.length) return null;
        const pick = get().mesas.filter((m) => nums.includes(m.numero));
        if (pick.length !== nums.length) return null;
        if (pick.some((m) => m.estado !== "libre")) return null;
        const cap = pick.reduce((s, m) => s + (m.capacidad ?? 4), 0);
        const now = new Date().toISOString();
        const primaria = nums[0];
        const e: WaitlistView = {
          id: crypto.randomUUID(),
          nombre: (nombre ?? "").trim() || "Walk-in",
          personas: Math.max(1, personas ?? cap),
          estado: "sentado",
          tableNumber: primaria,
          qrToken: crypto.randomUUID(),
          createdAt: now,
          notifiedAt: null,
          seatedAt: now,
          cancelledAt: null,
          seenAt: null,
          empleado,
        };
        const setNums = new Set(nums);
        set((s) => ({
          esperas: [e, ...s.esperas],
          mesas: s.mesas.map((m) =>
            setNums.has(m.numero)
              ? {
                  ...m,
                  estado: "ocupada" as const,
                  waitlistId: e.id,
                  reservationId: null,
                }
              : m,
          ),
        }));
        return e;
      },

      setCapacidad: (numero, capacidad) =>
        set((s) => ({
          mesas: s.mesas.map((m) =>
            m.numero === numero
              ? {
                  ...m,
                  capacidad: Math.max(1, Math.min(50, Math.round(capacidad) || 4)),
                }
              : m,
          ),
        })),

      agregarReserva: ({
        nombre,
        personas,
        tableNumbers,
        horario,
        graceMinutes,
        empleado = null,
      }) => {
        const nums = [...new Set(tableNumbers)]
          .filter((n) => n >= 1)
          .sort((a, b) => a - b);
        if (!nums.length) return null;
        const pick = get().mesas.filter((m) => nums.includes(m.numero));
        if (pick.length !== nums.length) return null;
        const cap = pick.reduce((s, m) => s + (m.capacidad ?? 4), 0);
        if (cap < Math.max(1, personas)) return null;
        if (conflictingReservation(nums, horario, get().reservas)) return null;
        const primaria = nums[0];
        const r: ReservationView = {
          id: crypto.randomUUID(),
          nombre: nombre.trim() || "Reserva",
          personas: Math.max(1, personas),
          tableNumber: primaria,
          tableNumbers: nums,
          horario,
          graceMinutes,
          estado: "activa",
          createdAt: new Date().toISOString(),
          seatedAt: null,
          cancelledAt: null,
          expiredAt: null,
          empleado,
        };
        set((s) => ({
          reservas: [...s.reservas, r].sort((a, b) =>
            a.horario.localeCompare(b.horario),
          ),
        }));
        return r;
      },

      sentarReserva: (id) =>
        set((s) => {
          const r = s.reservas.find((x) => x.id === id);
          if (!r || r.estado !== "activa") return s;
          const now = new Date().toISOString();
          const nums = new Set(
            r.tableNumbers?.length ? r.tableNumbers : [r.tableNumber],
          );
          return {
            reservas: s.reservas.map((x) =>
              x.id === id
                ? { ...x, estado: "sentada" as const, seatedAt: now }
                : x,
            ),
            mesas: s.mesas.map((m) =>
              nums.has(m.numero) || m.reservationId === id
                ? {
                    ...m,
                    estado: "ocupada" as const,
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
          if (!r || r.estado !== "activa") return s;
          const now = new Date().toISOString();
          return {
            reservas: s.reservas.map((x) =>
              x.id === id
                ? { ...x, estado: "cancelada" as const, cancelledAt: now }
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
                  estado: "libre" as const,
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
              if (e.estado !== "esperando" && e.estado !== "avisado") return e;
              return {
                ...e,
                estado: e.estado === "esperando" ? ("avisado" as const) : e.estado,
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
            if (r.estado !== "activa") return r;
            const limite =
              new Date(r.horario).getTime() + r.graceMinutes * 60_000;
            if (now <= limite) return r;
            changed = true;
            return {
              ...r,
              estado: "expirada" as ReservationStatus,
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
