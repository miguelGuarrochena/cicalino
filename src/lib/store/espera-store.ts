import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabaseConfigurado } from "@/lib/supabase/config";
import type {
  EsperaStatus,
  EsperaView,
  MesaView,
  ReservaStatus,
  ReservaView,
} from "@/lib/types";

interface EsperaState {
  esperas: EsperaView[];
  mesas: MesaView[];
  reservas: ReservaView[];
  seedSiVacio: (cantidadMesas?: number) => void;
  setMesasCount: (n: number) => void;
  agregarEspera: (
    nombre: string,
    personas: number,
    empleado?: string | null,
  ) => EsperaView;
  cambiarEstado: (
    id: string,
    estado: EsperaStatus,
    mesaNumero?: number | null,
    mesasExtra?: number[],
  ) => void;
  liberarMesa: (
    numero: number,
    opts?: { soloEsta?: boolean },
  ) => void;
  ocuparMesa: (numero: number, esperaId: string) => void;
  /** Walk-in: marca mesas ocupadas y deja un registro sentado (sin cola/QR). */
  ocuparWalkIn: (args: {
    mesaNumeros: number[];
    nombre?: string;
    personas?: number;
    empleado?: string | null;
  }) => EsperaView | null;
  setCapacidad: (numero: number, capacidad: number) => void;
  agregarReserva: (args: {
    nombre: string;
    personas: number;
    mesaNumeros: number[];
    horario: string;
    graciaMinutos: 15 | 20;
    empleado?: string | null;
  }) => ReservaView | null;
  sentarReserva: (id: string) => void;
  cancelarReserva: (id: string) => void;
  eliminarEspera: (id: string) => void;
  /** Reavisa (bump avisadoEn) sin cambiar de sentado/cancelado. */
  reavisarEspera: (id: string) => void;
  expirarReservasDemo: () => void;
}

const iso = (minsAgo = 0) =>
  new Date(Date.now() - minsAgo * 60_000).toISOString();

const buildMesas = (n: number, prev: MesaView[] = []): MesaView[] => {
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
      esperaId: null,
      reservaId: null,
    };
  });
};

export const useEsperaStore = create<EsperaState>()(
  persist(
    (set, get) => ({
      esperas: [],
      mesas: [],
      reservas: [],

      seedSiVacio: (cantidadMesas = 10) => {
        if (get().esperas.length || get().mesas.length || get().reservas.length) {
          if (!get().mesas.length) {
            set({ mesas: buildMesas(cantidadMesas) });
          }
          return;
        }
        const mesas = buildMesas(cantidadMesas);
        const reservaDemo: ReservaView = {
          id: "res-demo-1",
          nombre: "Martínez",
          personas: 3,
          mesaNumero: 5,
          mesasNumeros: [5],
          horario: new Date(Date.now() + 90 * 60_000).toISOString(),
          graciaMinutos: 15,
          estado: "activa",
          creadoEn: iso(30),
          sentadoEn: null,
          canceladoEn: null,
          expiradoEn: null,
          empleado: "Lucía",
        };
        mesas[0] = {
          ...mesas[0],
          estado: "ocupada",
          esperaId: "esp-demo-old",
          reservaId: null,
        };
        mesas[2] = {
          ...mesas[2],
          estado: "ocupada",
          esperaId: "esp-demo-old2",
          reservaId: null,
        };
        mesas[4] = {
          ...mesas[4],
          estado: "reservada",
          esperaId: null,
          reservaId: reservaDemo.id,
        };
        set({
          mesas,
          reservas: [reservaDemo],
          esperas: [
            {
              id: "esp-demo-1",
              nombre: "García",
              personas: 4,
              estado: "esperando",
              mesaNumero: null,
              qrToken: "11111111-1111-4111-8111-111111111111",
              creadoEn: iso(12),
              avisadoEn: null,
              sentadoEn: null,
              canceladoEn: null,
              vistoEn: iso(11),
              empleado: "Lucía",
            },
            {
              id: "esp-demo-2",
              nombre: "López",
              personas: 2,
              estado: "avisado",
              mesaNumero: null,
              qrToken: "22222222-2222-4222-8222-222222222222",
              creadoEn: iso(25),
              avisadoEn: iso(2),
              sentadoEn: null,
              canceladoEn: null,
              vistoEn: iso(24),
              empleado: "Marcos",
            },
          ],
        });
      },

      setMesasCount: (n) => set((s) => ({ mesas: buildMesas(n, s.mesas) })),

      agregarEspera: (nombre, personas, empleado = null) => {
        const e: EsperaView = {
          id: crypto.randomUUID(),
          nombre: nombre.trim() || "Grupo",
          personas: Math.max(1, personas),
          estado: "esperando",
          mesaNumero: null,
          qrToken: crypto.randomUUID(),
          creadoEn: new Date().toISOString(),
          avisadoEn: null,
          sentadoEn: null,
          canceladoEn: null,
          vistoEn: null,
          empleado,
        };
        set((s) => ({ esperas: [e, ...s.esperas] }));
        return e;
      },

      cambiarEstado: (id, estado, mesaNumero = null, mesasExtra = []) =>
        set((s) => {
          const now = new Date().toISOString();
          const esperas = s.esperas.map((e) => {
            if (e.id !== id) return e;
            const next = { ...e, estado };
            if (estado === "avisado") next.avisadoEn = now;
            if (estado === "sentado") {
              next.sentadoEn = now;
              next.mesaNumero = mesaNumero ?? e.mesaNumero;
              // Si sentás sin pasar por Avisar, igual dejá marca de aviso
              // para que el cliente (pestaña abierta) vea el cambio.
              if (!next.avisadoEn) next.avisadoEn = now;
            }
            if (estado === "cancelado") next.canceladoEn = now;
            return next;
          });
          let mesas = s.mesas;
          if (estado === "sentado" && mesaNumero) {
            const nums = new Set([mesaNumero, ...mesasExtra]);
            mesas = s.mesas.map((m) =>
              nums.has(m.numero)
                ? {
                    ...m,
                    estado: "ocupada" as const,
                    esperaId: id,
                    reservaId: null,
                  }
                : m,
            );
          }
          return { esperas, mesas };
        }),

      liberarMesa: (numero, opts) =>
        set((s) => {
          const mesa = s.mesas.find((m) => m.numero === numero);
          let reservas = s.reservas;
          if (mesa?.reservaId && mesa.estado === "reservada") {
            // Reserva activa: cancelar siempre libera todo el bloque.
            const now = new Date().toISOString();
            const reservaId = mesa.reservaId;
            reservas = s.reservas.map((r) =>
              r.id === reservaId && r.estado === "activa"
                ? { ...r, estado: "cancelada" as const, canceladoEn: now }
                : r,
            );
            return {
              reservas,
              mesas: s.mesas.map((m) =>
                m.reservaId === reservaId
                  ? {
                      ...m,
                      estado: "libre" as const,
                      esperaId: null,
                      reservaId: null,
                    }
                  : m,
              ),
            };
          }
          if (opts?.soloEsta) {
            return {
              reservas,
              mesas: s.mesas.map((m) =>
                m.numero === numero
                  ? {
                      ...m,
                      estado: "libre" as const,
                      esperaId: null,
                      reservaId: null,
                    }
                  : m,
              ),
            };
          }
          const esperaId =
            mesa?.estado === "ocupada" ? mesa.esperaId : null;
          const reservaOcupadaId =
            mesa?.estado === "ocupada" ? mesa.reservaId : null;
          return {
            reservas,
            mesas: s.mesas.map((m) =>
              (esperaId && m.esperaId === esperaId) ||
              (reservaOcupadaId && m.reservaId === reservaOcupadaId) ||
              m.numero === numero
                ? {
                    ...m,
                    estado: "libre" as const,
                    esperaId: null,
                    reservaId: null,
                  }
                : m,
            ),
          };
        }),

      ocuparMesa: (numero, esperaId) =>
        set((s) => ({
          mesas: s.mesas.map((m) =>
            m.numero === numero
              ? {
                  ...m,
                  estado: "ocupada" as const,
                  esperaId,
                  reservaId: null,
                }
              : m,
          ),
        })),

      ocuparWalkIn: ({
        mesaNumeros,
        nombre,
        personas,
        empleado = null,
      }) => {
        const nums = [...new Set(mesaNumeros)]
          .filter((n) => n >= 1)
          .sort((a, b) => a - b);
        if (!nums.length) return null;
        const pick = get().mesas.filter((m) => nums.includes(m.numero));
        if (pick.length !== nums.length) return null;
        if (pick.some((m) => m.estado !== "libre")) return null;
        const cap = pick.reduce((s, m) => s + (m.capacidad ?? 4), 0);
        const now = new Date().toISOString();
        const primaria = nums[0];
        const e: EsperaView = {
          id: crypto.randomUUID(),
          nombre: (nombre ?? "").trim() || "Walk-in",
          personas: Math.max(1, personas ?? cap),
          estado: "sentado",
          mesaNumero: primaria,
          qrToken: crypto.randomUUID(),
          creadoEn: now,
          avisadoEn: null,
          sentadoEn: now,
          canceladoEn: null,
          vistoEn: null,
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
                  esperaId: e.id,
                  reservaId: null,
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
        mesaNumeros,
        horario,
        graciaMinutos,
        empleado = null,
      }) => {
        const nums = [...new Set(mesaNumeros)]
          .filter((n) => n >= 1)
          .sort((a, b) => a - b);
        if (!nums.length) return null;
        const pick = get().mesas.filter((m) => nums.includes(m.numero));
        if (pick.length !== nums.length) return null;
        if (pick.some((m) => m.estado !== "libre")) return null;
        const cap = pick.reduce((s, m) => s + (m.capacidad ?? 4), 0);
        if (cap < Math.max(1, personas)) return null;
        const primaria = nums[0];
        const r: ReservaView = {
          id: crypto.randomUUID(),
          nombre: nombre.trim() || "Reserva",
          personas: Math.max(1, personas),
          mesaNumero: primaria,
          mesasNumeros: nums,
          horario,
          graciaMinutos,
          estado: "activa",
          creadoEn: new Date().toISOString(),
          sentadoEn: null,
          canceladoEn: null,
          expiradoEn: null,
          empleado,
        };
        const setNums = new Set(nums);
        set((s) => ({
          reservas: [...s.reservas, r].sort((a, b) =>
            a.horario.localeCompare(b.horario),
          ),
          mesas: s.mesas.map((m) =>
            setNums.has(m.numero)
              ? {
                  ...m,
                  estado: "reservada" as const,
                  reservaId: r.id,
                  esperaId: null,
                }
              : m,
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
            r.mesasNumeros?.length ? r.mesasNumeros : [r.mesaNumero],
          );
          // También por reservaId (por si mesasNumeros quedó viejo).
          return {
            reservas: s.reservas.map((x) =>
              x.id === id
                ? { ...x, estado: "sentada" as const, sentadoEn: now }
                : x,
            ),
            mesas: s.mesas.map((m) =>
              nums.has(m.numero) || m.reservaId === id
                ? {
                    ...m,
                    estado: "ocupada" as const,
                    reservaId: id,
                    esperaId: null,
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
                ? { ...x, estado: "cancelada" as const, canceladoEn: now }
                : x,
            ),
            mesas: s.mesas.map((m) =>
              m.reservaId === id && m.estado === "reservada"
                ? {
                    ...m,
                    estado: "libre" as const,
                    reservaId: null,
                    esperaId: null,
                  }
                : m,
            ),
          };
        }),

      eliminarEspera: (id) =>
        set((s) => ({
          esperas: s.esperas.filter((e) => e.id !== id),
          mesas: s.mesas.map((m) =>
            m.esperaId === id
              ? {
                  ...m,
                  estado: "libre" as const,
                  esperaId: null,
                  reservaId: null,
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
                avisadoEn: now,
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
              new Date(r.horario).getTime() + r.graciaMinutos * 60_000;
            if (now <= limite) return r;
            changed = true;
            return {
              ...r,
              estado: "expirada" as ReservaStatus,
              expiradoEn: new Date().toISOString(),
            };
          });
          if (!changed) return s;
          const expiredIds = new Set(
            reservas
              .filter((r) => r.estado === "expirada")
              .map((r) => r.id),
          );
          return {
            reservas,
            mesas: s.mesas.map((m) =>
              m.estado === "reservada" &&
              m.reservaId &&
              expiredIds.has(m.reservaId)
                ? {
                    ...m,
                    estado: "libre" as const,
                    reservaId: null,
                    esperaId: null,
                  }
                : m,
            ),
          };
        }),
    }),
    {
      name: "cicalino-espera-demo-v3",
      skipHydration: true,
      partialize: (s) =>
        supabaseConfigurado
          ? { esperas: [], mesas: [], reservas: [] }
          : { esperas: s.esperas, mesas: s.mesas, reservas: s.reservas },
    },
  ),
);
