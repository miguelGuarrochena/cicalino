import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TipoNegocio } from "@/lib/store/config-store";
import { PRECIO_POR_SUCURSAL } from "@/lib/precios";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { sumarCicloCobro } from "@/lib/billing";

export { PRECIO_POR_SUCURSAL };

export interface BranchRow {
  id: string;
  organizacionId: string;
  nombre: string;
  tipo: TipoNegocio;
  direccion: string;
  activo: boolean;
  pedidosHoy: number;
}

export type PlanTipo = "mensual" | "anual" | "gratis";

export interface OrganizationRow {
  id: string;
  nombre: string;
  responsable: string;
  telefono: string;
  cuil: string;
  direccion: string;
  duenoEmail: string;
  /** Sucursales que puede tener activas (cobro = cupo × precio). */
  cupo: number;
  pagado: boolean;
  activo: boolean;
  /** Ciclo de cobro: mensual, anual o cortesía (gratis). */
  plan: PlanTipo;
  /** Fecha hasta la cual no se cobra (mes gratis / prueba). ISO o null. */
  mesGratisHasta: string | null;
  /** Próximo cobro esperado (ISO). Null = sin fecha cargada. */
  proximoCobroEn: string | null;
  altaEn: string;
  sucursales: BranchRow[];
}

export type OrgInput = {
  nombre: string;
  responsable: string;
  telefono: string;
  cuil: string;
  direccion: string;
  duenoEmail: string;
  cupo: number;
  plan: PlanTipo;
};

export type BranchInput = {
  nombre: string;
  tipo: TipoNegocio;
  direccion: string;
};

interface SuperadminState {
  organizaciones: OrganizationRow[];
  /** Reemplaza la lista completa (al cargar desde la base). */
  setOrganizaciones: (list: OrganizationRow[]) => void;
  altaOrg: (data: OrgInput) => string; // id
  actualizarOrg: (id: string, data: Partial<OrgInput>) => void;
  toggleOrgActivo: (id: string) => void;
  toggleOrgPagado: (id: string) => void;
  /** Da N meses de cortesía (por defecto 1) desde hoy. */
  darMesGratis: (id: string, meses?: number) => void;
  quitarOrg: (id: string) => void;
  altaSucursal: (
    organizationId: string,
    data: BranchInput,
  ) => { ok: true; id: string } | { ok: false; error: "cupo" };
  actualizarSucursal: (
    organizationId: string,
    branchId: string,
    data: Partial<BranchInput>,
  ) => void;
  toggleSucursalActivo: (organizationId: string, branchId: string) => void;
  quitarSucursal: (organizationId: string, branchId: string) => void;
}

const dia = (n: number) =>
  new Date(Date.now() - n * 86400000).toISOString();

const seed = (): OrganizationRow[] => {
  const org1 = "org-esquina";
  const org2 = "org-buen";
  return [
    {
      id: org1,
      nombre: "La Esquina SA",
      responsable: "Carlos Ruiz",
      telefono: "+54 9 341 555 0101",
      cuil: "30-71234567-8",
      direccion: "Calle Falsa 742, Rosario",
      duenoEmail: "hola@laesquina.com",
      cupo: 2,
      pagado: true,
      activo: true,
      plan: "mensual",
      mesGratisHasta: null,
      proximoCobroEn: dia(5),
      altaEn: dia(40),
      sucursales: [
        {
          id: "suc-centro",
          organizacionId: org1,
          nombre: "Centro",
          tipo: "panaderia",
          direccion: "Calle Falsa 742, Rosario",
          activo: true,
          pedidosHoy: 38,
        },
        {
          id: "suc-norte",
          organizacionId: org1,
          nombre: "Norte",
          tipo: "panaderia",
          direccion: "Av. Pellegrini 1200, Rosario",
          activo: true,
          pedidosHoy: 27,
        },
      ],
    },
    {
      id: org2,
      nombre: "El Buen Sabor",
      responsable: "María Gómez",
      telefono: "+54 9 351 444 2200",
      cuil: "27-25999888-1",
      direccion: "San Martín 500, Córdoba",
      duenoEmail: "pedidos@buensabor.com",
      cupo: 1,
      pagado: false,
      activo: true,
      plan: "mensual",
      mesGratisHasta: null,
      proximoCobroEn: dia(-2),
      altaEn: dia(7),
      sucursales: [
        {
          id: "suc-buen",
          organizacionId: org2,
          nombre: "Córdoba",
          tipo: "rotiseria",
          direccion: "San Martín 500, Córdoba",
          activo: true,
          pedidosHoy: 22,
        },
      ],
    },
  ];
};

/** ¿La organización está en período de cortesía (mes gratis / prueba)? */
export const enGracia = (org: OrganizationRow): boolean =>
  !!org.mesGratisHasta && new Date(org.mesGratisHasta).getTime() > Date.now();

/** Monto mensual recurrente (cupo × precio); 0 si el plan es gratis. */
export const montoMensual = (org: OrganizationRow): number =>
  org.plan === "gratis" ? 0 : org.cupo * PRECIO_POR_SUCURSAL;

// Cobro mensual efectivo: 0 si está pausada, es gratis o está en cortesía.
export const monthlyCharge = (org: OrganizationRow): number => {
  if (!org.activo || org.plan === "gratis" || enGracia(org)) return 0;
  return montoMensual(org);
};

// Total del próximo cobro según el ciclo. Anual = 10 meses (2 de regalo).
export const cobroProximo = (org: OrganizationRow): number => {
  const base = monthlyCharge(org);
  return org.plan === "anual" ? base * 10 : base;
};

export const useSuperadminStore = create<SuperadminState>()(
  persist(
    (set, get) => ({
      // En producción arranca vacío y se llena desde la base; en demo, ejemplos.
      organizaciones: supabaseConfigurado ? [] : seed(),

      setOrganizaciones: (list) => set({ organizaciones: list }),

      altaOrg: (data) => {
        const id = crypto.randomUUID();
        set((s) => ({
          organizaciones: [
            {
              id,
              nombre: data.nombre.trim(),
              responsable: data.responsable.trim(),
              telefono: data.telefono.trim(),
              cuil: data.cuil.trim(),
              direccion: data.direccion.trim(),
              duenoEmail: data.duenoEmail.trim(),
              cupo: Math.max(1, data.cupo || 1),
              pagado: true,
              activo: true,
              plan: data.plan ?? "mensual",
              mesGratisHasta: null,
              proximoCobroEn: null,
              altaEn: new Date().toISOString(),
              sucursales: [],
            },
            ...s.organizaciones,
          ],
        }));
        return id;
      },

      actualizarOrg: (id, data) =>
        set((s) => ({
          organizaciones: s.organizaciones.map((o) => {
            if (o.id !== id) return o;
            const next = { ...o };
            if (data.nombre != null) next.nombre = data.nombre.trim();
            if (data.responsable != null)
              next.responsable = data.responsable.trim();
            if (data.telefono != null) next.telefono = data.telefono.trim();
            if (data.cuil != null) next.cuil = data.cuil.trim();
            if (data.direccion != null) next.direccion = data.direccion.trim();
            if (data.duenoEmail != null)
              next.duenoEmail = data.duenoEmail.trim();
            if (data.cupo != null) next.cupo = Math.max(1, data.cupo);
            if (data.plan != null) next.plan = data.plan;
            return next;
          }),
        })),

      toggleOrgActivo: (id) =>
        set((s) => ({
          organizaciones: s.organizaciones.map((o) =>
            o.id === id ? { ...o, activo: !o.activo } : o,
          ),
        })),

      toggleOrgPagado: (id) =>
        set((s) => ({
          organizaciones: s.organizaciones.map((o) => {
            if (o.id !== id) return o;
            const next = !o.pagado;
            if (!next) {
              return { ...o, pagado: false, proximoCobroEn: new Date().toISOString() };
            }
            const prox = sumarCicloCobro(o.plan);
            return {
              ...o,
              pagado: true,
              proximoCobroEn: prox ? prox.toISOString() : null,
            };
          }),
        })),

      darMesGratis: (id, meses = 1) =>
        set((s) => ({
          organizaciones: s.organizaciones.map((o) => {
            if (o.id !== id) return o;
            const base = enGracia(o)
              ? new Date(o.mesGratisHasta as string)
              : new Date();
            base.setMonth(base.getMonth() + meses);
            const iso = base.toISOString();
            return { ...o, mesGratisHasta: iso, proximoCobroEn: iso };
          }),
        })),

      quitarOrg: (id) =>
        set((s) => ({
          organizaciones: s.organizaciones.filter((o) => o.id !== id),
        })),

      altaSucursal: (organizationId, data) => {
        const org = get().organizaciones.find((o) => o.id === organizationId);
        if (!org) return { ok: false as const, error: "cupo" as const };
        if (org.sucursales.length >= org.cupo) {
          return { ok: false as const, error: "cupo" as const };
        }
        const id = crypto.randomUUID();
        set((s) => ({
          organizaciones: s.organizaciones.map((o) =>
            o.id === organizationId
              ? {
                  ...o,
                  sucursales: [
                    ...o.sucursales,
                    {
                      id,
                      organizacionId: organizationId,
                      nombre: data.nombre.trim(),
                      tipo: data.tipo,
                      direccion: data.direccion.trim(),
                      activo: true,
                      pedidosHoy: 0,
                    },
                  ],
                }
              : o,
          ),
        }));
        return { ok: true as const, id };
      },

      actualizarSucursal: (organizationId, branchId, data) =>
        set((s) => ({
          organizaciones: s.organizaciones.map((o) => {
            if (o.id !== organizationId) return o;
            return {
              ...o,
              sucursales: o.sucursales.map((suc) => {
                if (suc.id !== branchId) return suc;
                return {
                  ...suc,
                  ...(data.nombre != null
                    ? { nombre: data.nombre.trim() }
                    : {}),
                  ...(data.tipo != null ? { tipo: data.tipo } : {}),
                  ...(data.direccion != null
                    ? { direccion: data.direccion.trim() }
                    : {}),
                };
              }),
            };
          }),
        })),

      toggleSucursalActivo: (organizationId, branchId) =>
        set((s) => ({
          organizaciones: s.organizaciones.map((o) =>
            o.id === organizationId
              ? {
                  ...o,
                  sucursales: o.sucursales.map((suc) =>
                    suc.id === branchId
                      ? { ...suc, activo: !suc.activo }
                      : suc,
                  ),
                }
              : o,
          ),
        })),

      quitarSucursal: (organizationId, branchId) =>
        set((s) => ({
          organizaciones: s.organizaciones.map((o) =>
            o.id === organizationId
              ? {
                  ...o,
                  sucursales: o.sucursales.filter((suc) => suc.id !== branchId),
                }
              : o,
          ),
        })),
    }),
    {
      name: "cicalino-superadmin-v2",
      skipHydration: true,
    },
  ),
);

/** Helpers para UI. */
export const orgById = (
  orgs: OrganizationRow[],
  id: string | null | undefined,
) => orgs.find((o) => o.id === id);

export const branchById = (
  orgs: OrganizationRow[],
  branchId: string | null | undefined,
): BranchRow | undefined => {
  if (!branchId) return undefined;
  for (const o of orgs) {
    const s = o.sucursales.find((x) => x.id === branchId);
    if (s) return s;
  }
  return undefined;
};
