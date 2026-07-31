import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BusinessType } from "@/lib/store/config-store";
import type { SubscriptionStatus } from "@/lib/subscription";
import {
  PRICE_PER_BRANCH,
  monthlyPriceForBranch,
  monthlyPriceForBranches,
  type ModuleFlags,
} from "@/lib/pricing";
import { supabaseConfigured } from "@/lib/supabase/config";
import { addBillingCycle } from "@/lib/billing";

export { PRICE_PER_BRANCH, monthlyPriceForBranch, monthlyPriceForBranches };
export type { ModuleFlags };

export interface BranchRow {
  id: string;
  organizationId: string;
  name: string;
  altaEn: string | null;
  cobroDesde: string | null;
  responsableId: string | null;
  tipo: BusinessType;
  direccion: string;
  activo: boolean;
  pedidosHoy: number;
  moduloPedidos: boolean;
  moduloEspera: boolean;
}

export type PlanTipo = "mensual" | "anual" | "gratis";

export interface OrganizationRow {
  id: string;
  name: string;
  responsable: string;
  telefono: string;
  cuil: string;
  direccion: string;
  ownerEmail: string;
  cupo: number;
  pagado: boolean;
  activo: boolean;
  plan: PlanTipo;
  freeMonthUntil: string | null;
  nextChargeAt: string | null;
  contractAcceptedAt: string | null;
  moduloPedidos: boolean;
  moduloEspera: boolean;
  altaEn: string;
  estadoSuscripcion: SubscriptionStatus;
  pruebaInicio: string | null;
  pruebaFin: string | null;
  proximaFactura: string | null;
  diaCiclo: number | null;
  ultimoPagoEn: string | null;
  sucursales: BranchRow[];
}

export const isContractPending = (org: OrganizationRow): boolean =>
  !org.contractAcceptedAt;

export type OrgInput = {
  name: string;
  responsable: string;
  telefono: string;
  cuil: string;
  direccion: string;
  ownerEmail: string;
  cupo: number;
  plan: PlanTipo;
  moduloPedidos?: boolean;
  moduloEspera?: boolean;
};

export type BranchInput = {
  name: string;
  tipo: BusinessType;
  direccion: string;
  moduloPedidos?: boolean;
  moduloEspera?: boolean;
};

interface SuperadminState {
  organizaciones: OrganizationRow[];
  orgsError: string | null;
  setOrganizaciones: (list: OrganizationRow[]) => void;
  setOrgsError: (msg: string | null) => void;
  altaOrg: (data: OrgInput) => string;
  actualizarOrg: (id: string, data: Partial<OrgInput>) => void;
  toggleOrgActivo: (id: string) => void;
  toggleOrgPagado: (id: string) => void;
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
      name: "La Esquina SA",
      responsable: "Carlos Ruiz",
      telefono: "+54 9 341 555 0101",
      cuil: "30-71234567-8",
      direccion: "Calle Falsa 742, Rosario",
      ownerEmail: "hola@laesquina.com",
      cupo: 2,
      pagado: true,
      activo: true,
      plan: "mensual",
      freeMonthUntil: null,
      nextChargeAt: dia(5),
      contractAcceptedAt: dia(40),
      moduloPedidos: true,
      moduloEspera: true,
      altaEn: dia(40),
      estadoSuscripcion: "active",
      pruebaInicio: null,
      pruebaFin: null,
      proximaFactura: null,
      diaCiclo: null,
      ultimoPagoEn: null,
      sucursales: [
        {
          id: "suc-centro",
          organizationId: org1,
          name: "Centro",
          tipo: "panaderia",
          direccion: "Calle Falsa 742, Rosario",
          activo: true,
          pedidosHoy: 38,
          altaEn: null,
          cobroDesde: null,
          responsableId: null,
          moduloPedidos: true,
          moduloEspera: true,
        },
        {
          id: "suc-norte",
          organizationId: org1,
          name: "Norte",
          tipo: "panaderia",
          direccion: "Av. Pellegrini 1200, Rosario",
          activo: true,
          pedidosHoy: 27,
          altaEn: null,
          cobroDesde: null,
          responsableId: null,
          moduloPedidos: true,
          moduloEspera: false,
        },
      ],
    },
    {
      id: org2,
      name: "El Buen Sabor",
      responsable: "María Gómez",
      telefono: "+54 9 351 444 2200",
      cuil: "27-25999888-1",
      direccion: "San Martín 500, Córdoba",
      ownerEmail: "pedidos@buensabor.com",
      cupo: 1,
      pagado: false,
      activo: true,
      plan: "mensual",
      freeMonthUntil: null,
      nextChargeAt: dia(-2),
      contractAcceptedAt: dia(7),
      moduloPedidos: true,
      moduloEspera: false,
      altaEn: dia(7),
      estadoSuscripcion: "active",
      pruebaInicio: null,
      pruebaFin: null,
      proximaFactura: null,
      diaCiclo: null,
      ultimoPagoEn: null,
      sucursales: [
        {
          id: "suc-buen",
          organizationId: org2,
          name: "Córdoba",
          tipo: "rotiseria",
          direccion: "San Martín 500, Córdoba",
          activo: true,
          pedidosHoy: 22,
          altaEn: null,
          cobroDesde: null,
          responsableId: null,
          moduloPedidos: true,
          moduloEspera: false,
        },
      ],
    },
  ];
};

export const enGracia = (org: OrganizationRow): boolean =>
  !!org.freeMonthUntil && new Date(org.freeMonthUntil).getTime() > Date.now();

/**
 * Única fuente de verdad de qué sucursales generan cobro.
 * Solo las activas: una dada de baja conserva su historial pero no factura.
 */
export const billableBranches = (org: OrganizationRow): BranchRow[] =>
  org.plan === "gratis" ? [] : org.sucursales.filter((s) => s.activo);

export const monthlyAmount = (org: OrganizationRow): number => {
  if (org.plan === "gratis") return 0;
  const activas = billableBranches(org);
  if (activas.length) {
    return monthlyPriceForBranches(
      activas.map((s) => ({
        pedidos: s.moduloPedidos !== false,
        espera: Boolean(s.moduloEspera),
      })),
    );
  }
  return 0;
};

export const monthlyCharge = (org: OrganizationRow): number => {
  if (!org.activo || org.plan === "gratis" || enGracia(org)) return 0;
  return monthlyAmount(org);
};

export const upcomingCharge = (org: OrganizationRow): number => {
  const base = monthlyCharge(org);
  return org.plan === "anual" ? base * 10 : base;
};

export const useSuperadminStore = create<SuperadminState>()(
  persist(
    (set, get) => ({
      organizaciones: supabaseConfigured ? [] : seed(),
      orgsError: null,

      setOrganizaciones: (list) => set({ organizaciones: list }),
      setOrgsError: (msg) => set({ orgsError: msg }),

      altaOrg: (data) => {
        const id = crypto.randomUUID();
        set((s) => ({
          organizaciones: [
            {
              id,
              name: data.name.trim(),
              responsable: data.responsable.trim(),
              telefono: data.telefono.trim(),
              cuil: data.cuil.trim(),
              direccion: data.direccion.trim(),
              ownerEmail: data.ownerEmail.trim(),
              cupo: Math.max(1, data.cupo || 1),
              pagado: true,
              activo: false,
              plan: data.plan ?? "mensual",
              freeMonthUntil: null,
              nextChargeAt: null,
              contractAcceptedAt: null,
              moduloPedidos: data.moduloPedidos !== false,
              moduloEspera: Boolean(data.moduloEspera),
              altaEn: new Date().toISOString(),
              estadoSuscripcion: "active",
              pruebaInicio: null,
              pruebaFin: null,
              proximaFactura: null,
              diaCiclo: null,
              ultimoPagoEn: null,
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
            if (data.name != null) next.name = data.name.trim();
            if (data.responsable != null)
              next.responsable = data.responsable.trim();
            if (data.telefono != null) next.telefono = data.telefono.trim();
            if (data.cuil != null) next.cuil = data.cuil.trim();
            if (data.direccion != null) next.direccion = data.direccion.trim();
            if (data.ownerEmail != null)
              next.ownerEmail = data.ownerEmail.trim();
            if (data.cupo != null) next.cupo = Math.max(1, data.cupo);
            if (data.plan != null) next.plan = data.plan;
            if (data.moduloPedidos != null) next.moduloPedidos = data.moduloPedidos;
            if (data.moduloEspera != null) next.moduloEspera = data.moduloEspera;
            if (!next.moduloPedidos && !next.moduloEspera) {
              next.moduloPedidos = true;
            }
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
              return { ...o, pagado: false, nextChargeAt: new Date().toISOString() };
            }
            const prox = addBillingCycle(o.plan);
            return {
              ...o,
              pagado: true,
              nextChargeAt: prox ? prox.toISOString() : null,
            };
          }),
        })),

      darMesGratis: (id, meses = 1) =>
        set((s) => ({
          organizaciones: s.organizaciones.map((o) => {
            if (o.id !== id) return o;
            const base = enGracia(o)
              ? new Date(o.freeMonthUntil as string)
              : new Date();
            base.setMonth(base.getMonth() + meses);
            const iso = base.toISOString();
            return { ...o, freeMonthUntil: iso, nextChargeAt: iso };
          }),
        })),

      quitarOrg: (id) =>
        set((s) => ({
          organizaciones: s.organizaciones.filter((o) => o.id !== id),
        })),

      altaSucursal: (organizationId, data) => {
        const org = get().organizaciones.find((o) => o.id === organizationId);
        if (!org) return { ok: false as const, error: "cupo" as const };
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
                      organizationId: organizationId,
                      name: data.name.trim(),
                      tipo: data.tipo,
                      direccion: data.direccion.trim(),
                      activo: true,
                      pedidosHoy: 0,
                      altaEn: null,
                      cobroDesde: null,
                      responsableId: null,
                      moduloPedidos: data.moduloPedidos !== false,
                      moduloEspera: Boolean(data.moduloEspera),
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
                  ...(data.name != null
                    ? { name: data.name.trim() }
                    : {}),
                  ...(data.tipo != null ? { tipo: data.tipo } : {}),
                  ...(data.direccion != null
                    ? { direccion: data.direccion.trim() }
                    : {}),
                  ...(data.moduloPedidos != null || data.moduloEspera != null
                    ? (() => {
                        const pedidos =
                          data.moduloPedidos != null
                            ? data.moduloPedidos
                            : suc.moduloPedidos;
                        const espera =
                          data.moduloEspera != null
                            ? data.moduloEspera
                            : suc.moduloEspera;
                        if (!pedidos && !espera) {
                          return { moduloPedidos: true, moduloEspera: false };
                        }
                        return {
                          moduloPedidos: pedidos,
                          moduloEspera: espera,
                        };
                      })()
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
      name: "cicalino-superadmin-v3",
      skipHydration: true,
      partialize: (state) =>
        supabaseConfigured
          ? {}
          : { organizaciones: state.organizaciones },
    },
  ),
);

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
