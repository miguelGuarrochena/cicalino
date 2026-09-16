export const PRICE_ORDERS = 20_000;
export const PRICE_WAITLIST = 10_000;
export const PRICE_SPLIT = 15_000;
export const PRICE_BUNDLE = 25_000;

export const PRICE_PER_BRANCH = PRICE_ORDERS;

/* The three commercial modules a branch can contract. `espera` is the table
 * module (waitlist, reservations, table map); `pagos` is split bill. */
export type ModuleFlags = {
  pedidos: boolean;
  espera: boolean;
  pagos: boolean;
};

/* Every contractable combination has its own price, like Pedidos + Espera
 * always had. `pack` keeps its historical id: solicitudes rows and old
 * contracts use it. The same ids are allowed by solicitudes_pack_valido in
 * supabase/split-payments-module.sql. */
export type PackId =
  | "pedidos"
  | "espera"
  | "pagos"
  | "pack"
  | "pedidos_pagos"
  | "espera_pagos"
  | "completo";

export const PACK_IDS: PackId[] = [
  "pedidos",
  "espera",
  "pagos",
  "pack",
  "pedidos_pagos",
  "espera_pagos",
  "completo",
];

/* Catalog order for the landing and /pricing. Not a billing change: same
 * packs, listed so a restaurant owner sees every combination. */
export const SOLO_PACKS: PackId[] = ["pedidos", "espera", "pagos"];
export const COMBO_PACKS: PackId[] = [
  "pack",
  "espera_pagos",
  "pedidos_pagos",
  "completo",
];

export const PACK_PRICES: Record<PackId, number> = {
  pedidos: PRICE_ORDERS,
  espera: PRICE_WAITLIST,
  pagos: PRICE_SPLIT,
  pack: PRICE_BUNDLE,
  pedidos_pagos: 30_000,
  espera_pagos: 22_000,
  completo: 35_000,
};

const PACK_MODULES: Record<PackId, ModuleFlags> = {
  pedidos: { pedidos: true, espera: false, pagos: false },
  espera: { pedidos: false, espera: true, pagos: false },
  pagos: { pedidos: false, espera: false, pagos: true },
  pack: { pedidos: true, espera: true, pagos: false },
  pedidos_pagos: { pedidos: true, espera: false, pagos: true },
  espera_pagos: { pedidos: false, espera: true, pagos: true },
  completo: { pedidos: true, espera: true, pagos: true },
};

export const isPackId = (v: unknown): v is PackId =>
  typeof v === "string" && (PACK_IDS as string[]).includes(v);

export const modulesForPack = (id: PackId): ModuleFlags => ({
  ...PACK_MODULES[id],
});

export const packIdFor = (m: ModuleFlags): PackId | null => {
  const hit = PACK_IDS.find((id) => {
    const p = PACK_MODULES[id];
    return (
      p.pedidos === Boolean(m.pedidos) &&
      p.espera === Boolean(m.espera) &&
      p.pagos === Boolean(m.pagos)
    );
  });
  return hit ?? null;
};

export const monthlyPriceForBranch = (m: ModuleFlags): number => {
  const id = packIdFor(m);
  return id ? PACK_PRICES[id] : 0;
};

export const monthlyPriceForBranches = (lista: ModuleFlags[]): number =>
  lista.reduce((sum, m) => sum + monthlyPriceForBranch(m), 0);

const MODULE_NAMES: Record<keyof ModuleFlags, string> = {
  pedidos: "Pedidos",
  espera: "Espera",
  pagos: "Pagos divididos",
};

export const moduleLabel = (m: ModuleFlags): string => {
  const on = (Object.keys(MODULE_NAMES) as (keyof ModuleFlags)[]).filter(
    (k) => m[k],
  );
  if (!on.length) return "Sin módulos";
  if (on.length === 1) return `Solo ${MODULE_NAMES[on[0]!].toLowerCase()}`;
  return on.map((k) => MODULE_NAMES[k]).join(" + ");
};

export const branchesModuleLabel = (lista: ModuleFlags[]): string => {
  if (!lista.length) return "Sin sucursales";
  const labels = lista.map(moduleLabel);
  const uniq = [...new Set(labels)];
  if (uniq.length === 1) {
    return lista.length === 1 ? uniq[0]! : `${uniq[0]} × ${lista.length}`;
  }
  return `Mixto · ${lista.length} sucursales`;
};

/* A branch always has at least one module; with none, it falls back to
 * Pedidos, same as before the third module existed. */
export const normalizeModules = (m: Partial<ModuleFlags>): ModuleFlags => {
  const pagos = Boolean(m.pagos);
  const espera = Boolean(m.espera);
  const pedidos = m.pedidos !== false;
  if (!pedidos && !espera && !pagos) {
    return { pedidos: true, espera: false, pagos: false };
  }
  return { pedidos, espera, pagos };
};

/* DB row → flags, with the same defaults the columns have. */
export const modulesFromRow = (row: {
  modulo_pedidos?: boolean | null;
  modulo_espera?: boolean | null;
  modulo_pagos?: boolean | null;
}): ModuleFlags =>
  normalizeModules({
    pedidos: row.modulo_pedidos !== false,
    espera: Boolean(row.modulo_espera),
    pagos: Boolean(row.modulo_pagos),
  });

/* OR of the branches, which is what organizaciones.modulo_* stores. */
export const aggregateModules = (lista: ModuleFlags[]): ModuleFlags =>
  lista.length
    ? normalizeModules({
        pedidos: lista.some((m) => m.pedidos),
        espera: lista.some((m) => m.espera),
        pagos: lista.some((m) => m.pagos),
      })
    : { pedidos: true, espera: false, pagos: false };
