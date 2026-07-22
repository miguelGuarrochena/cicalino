import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TipoNegocio } from "@/lib/store/config-store";

export type PlanId = "prueba" | "base" | "pro";

// Precio mensual por plan (ARS). "prueba" es gratis (14 días).
export const PLAN_PRECIO: Record<PlanId, number> = {
  prueba: 0,
  base: 8000,
  pro: 15000,
};

export interface LocalRow {
  id: string;
  nombre: string;
  tipo: TipoNegocio;
  adminEmail: string;
  // Datos fiscales / contacto del responsable
  responsable: string;
  cuil: string;
  direccion: string;
  activo: boolean;
  plan: PlanId;
  pagado: boolean;
  pedidosHoy: number;
  altaEn: string; // ISO
}

export type LocalInput = {
  nombre: string;
  tipo: TipoNegocio;
  adminEmail: string;
  responsable: string;
  cuil: string;
  direccion: string;
  plan: PlanId;
};

interface SuperadminState {
  locales: LocalRow[];
  altaLocal: (data: LocalInput) => void;
  actualizarLocal: (id: string, data: Partial<LocalInput>) => void;
  toggleActivo: (id: string) => void;
  togglePagado: (id: string) => void;
  quitarLocal: (id: string) => void;
}

const seed = (): LocalRow[] => {
  const dia = (n: number) =>
    new Date(Date.now() - n * 86400000).toISOString();
  return [
    {
      id: "1",
      nombre: "Café Demo",
      tipo: "cafeteria",
      adminEmail: "dueno@cafedemo.com",
      responsable: "Ana Pérez",
      cuil: "27-30111222-3",
      direccion: "Av. Corrientes 1234, CABA",
      activo: true,
      plan: "pro",
      pagado: true,
      pedidosHoy: 65,
      altaEn: dia(40),
    },
    {
      id: "2",
      nombre: "Panadería La Esquina",
      tipo: "panaderia",
      adminEmail: "hola@laesquina.com",
      responsable: "Carlos Ruiz",
      cuil: "20-28444555-6",
      direccion: "Calle Falsa 742, Rosario",
      activo: true,
      plan: "base",
      pagado: true,
      pedidosHoy: 38,
      altaEn: dia(21),
    },
    {
      id: "3",
      nombre: "Rotisería El Buen Sabor",
      tipo: "rotiseria",
      adminEmail: "pedidos@buensabor.com",
      responsable: "María Gómez",
      cuil: "27-25999888-1",
      direccion: "San Martín 500, Córdoba",
      activo: true,
      plan: "base",
      pagado: false,
      pedidosHoy: 22,
      altaEn: dia(7),
    },
  ];
};

// Store del superadmin (Cicalino). Demo persistido; en produccion vive en la
// tabla `locales` + `usuarios` (rol admin).
export const useSuperadminStore = create<SuperadminState>()(
  persist(
    (set) => ({
      locales: seed(),
      altaLocal: (data) =>
        set((s) => ({
          locales: [
            {
              id: crypto.randomUUID(),
              nombre: data.nombre.trim(),
              tipo: data.tipo,
              adminEmail: data.adminEmail.trim(),
              responsable: data.responsable.trim(),
              cuil: data.cuil.trim(),
              direccion: data.direccion.trim(),
              activo: true,
              plan: data.plan,
              pagado: data.plan === "prueba",
              pedidosHoy: 0,
              altaEn: new Date().toISOString(),
            },
            ...s.locales,
          ],
        })),
      actualizarLocal: (id, data) =>
        set((s) => ({
          locales: s.locales.map((l) =>
            l.id === id
              ? {
                  ...l,
                  ...Object.fromEntries(
                    Object.entries(data).map(([k, v]) => [
                      k,
                      typeof v === "string" ? v.trim() : v,
                    ]),
                  ),
                }
              : l,
          ),
        })),
      toggleActivo: (id) =>
        set((s) => ({
          locales: s.locales.map((l) =>
            l.id === id ? { ...l, activo: !l.activo } : l,
          ),
        })),
      togglePagado: (id) =>
        set((s) => ({
          locales: s.locales.map((l) =>
            l.id === id ? { ...l, pagado: !l.pagado } : l,
          ),
        })),
      quitarLocal: (id) =>
        set((s) => ({ locales: s.locales.filter((l) => l.id !== id) })),
    }),
    {
      name: "cicalino-superadmin",
      skipHydration: true,
      // Migra locales viejos del localStorage sin los campos nuevos.
      merge: (persisted, current) => {
        const p = persisted as Partial<SuperadminState> | undefined;
        if (!p?.locales) return current;
        return {
          ...current,
          ...p,
          locales: p.locales.map((l) => {
            const row = l as Partial<LocalRow> & { id: string; nombre: string };
            return {
              ...row,
              responsable: row.responsable ?? "",
              cuil: row.cuil ?? "",
              direccion: row.direccion ?? "",
              tipo: row.tipo ?? "otro",
              adminEmail: row.adminEmail ?? "",
              activo: row.activo ?? true,
              plan: row.plan ?? "base",
              pagado: row.pagado ?? false,
              pedidosHoy: row.pedidosHoy ?? 0,
              altaEn: row.altaEn ?? new Date().toISOString(),
            } as LocalRow;
          }),
        };
      },
    },
  ),
);
