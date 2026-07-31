
export const PRICE_ORDERS = 20_000;
export const PRICE_WAITLIST = 10_000;
export const PRICE_BUNDLE = 25_000;

export const PRICE_PER_BRANCH = PRICE_ORDERS;

export type ModuleFlags = {
  pedidos: boolean;
  espera: boolean;
};

export const monthlyPriceForBranch = (m: ModuleFlags): number => {
  if (m.pedidos && m.espera) return PRICE_BUNDLE;
  if (m.pedidos) return PRICE_ORDERS;
  if (m.espera) return PRICE_WAITLIST;
  return 0;
};

export const monthlyPriceForBranches = (lista: ModuleFlags[]): number =>
  lista.reduce((sum, m) => sum + monthlyPriceForBranch(m), 0);

export const moduleLabel = (m: ModuleFlags): string => {
  if (m.pedidos && m.espera) return "Pedidos + Espera";
  if (m.pedidos) return "Solo pedidos";
  if (m.espera) return "Solo espera";
  return "Sin módulos";
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

export const normalizeModules = (m: Partial<ModuleFlags>): ModuleFlags => {
  const pedidos = m.pedidos !== false;
  const espera = Boolean(m.espera);
  if (!pedidos && !espera) return { pedidos: true, espera: false };
  return { pedidos, espera };
};
