import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabaseConfigurado } from "@/lib/supabase/config";
import type { EsperaStatus, EsperaView, MesaView } from "@/lib/types";

interface EsperaState {
  esperas: EsperaView[];
  mesas: MesaView[];
  seedSiVacio: (cantidadMesas?: number) => void;
  setMesasCount: (n: number) => void;
  agregarEspera: (nombre: string, personas: number, empleado?: string | null) => EsperaView;
  cambiarEstado: (id: string, estado: EsperaStatus, mesaNumero?: number | null) => void;
  liberarMesa: (numero: number) => void;
  ocuparMesa: (numero: number, esperaId: string) => void;
}

const iso = (minsAgo = 0) =>
  new Date(Date.now() - minsAgo * 60_000).toISOString();

const buildMesas = (n: number, prev: MesaView[] = []): MesaView[] => {
  const map = new Map(prev.map((m) => [m.numero, m]));
  return Array.from({ length: Math.max(1, n) }, (_, i) => {
    const num = i + 1;
    const old = map.get(num);
    return (
      old ?? {
        id: `mesa-demo-${num}`,
        numero: num,
        estado: "libre" as const,
        esperaId: null,
      }
    );
  });
};

export const useEsperaStore = create<EsperaState>()(
  persist(
    (set, get) => ({
      esperas: [],
      mesas: [],

      seedSiVacio: (cantidadMesas = 10) => {
        if (get().esperas.length || get().mesas.length) {
          if (!get().mesas.length) {
            set({ mesas: buildMesas(cantidadMesas) });
          }
          return;
        }
        const mesas = buildMesas(cantidadMesas);
        mesas[0] = { ...mesas[0], estado: "ocupada", esperaId: "esp-demo-old" };
        mesas[2] = { ...mesas[2], estado: "ocupada", esperaId: "esp-demo-old2" };
        set({
          mesas,
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

      setMesasCount: (n) =>
        set((s) => ({ mesas: buildMesas(n, s.mesas) })),

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

      cambiarEstado: (id, estado, mesaNumero = null) =>
        set((s) => {
          const now = new Date().toISOString();
          const esperas = s.esperas.map((e) => {
            if (e.id !== id) return e;
            const next = { ...e, estado };
            if (estado === "avisado") next.avisadoEn = now;
            if (estado === "sentado") {
              next.sentadoEn = now;
              next.mesaNumero = mesaNumero ?? e.mesaNumero;
            }
            if (estado === "cancelado") next.canceladoEn = now;
            return next;
          });
          let mesas = s.mesas;
          if (estado === "sentado" && mesaNumero) {
            mesas = s.mesas.map((m) =>
              m.numero === mesaNumero
                ? { ...m, estado: "ocupada" as const, esperaId: id }
                : m,
            );
          }
          return { esperas, mesas };
        }),

      liberarMesa: (numero) =>
        set((s) => ({
          mesas: s.mesas.map((m) =>
            m.numero === numero
              ? { ...m, estado: "libre" as const, esperaId: null }
              : m,
          ),
        })),

      ocuparMesa: (numero, esperaId) =>
        set((s) => ({
          mesas: s.mesas.map((m) =>
            m.numero === numero
              ? { ...m, estado: "ocupada" as const, esperaId }
              : m,
          ),
        })),
    }),
    {
      name: "cicalino-espera-demo",
      skipHydration: true,
      partialize: (s) =>
        supabaseConfigurado
          ? { esperas: [], mesas: [] }
          : { esperas: s.esperas, mesas: s.mesas },
    },
  ),
);
