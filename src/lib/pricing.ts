/** Precios de lista (ARS) — una sola fuente para UI, mails y contrato. */

/** Solo módulo Pedidos (aviso pedido listo). */
export const PRECIO_PEDIDOS = 20_000;
/** Solo módulo Espera de mesa. */
export const PRECIO_ESPERA = 10_000;
/** Pack Pedidos + Espera (ahorro vs sumar ambos). */
export const PRECIO_PACK = 25_000;

/**
 * Compat: precio histórico = solo pedidos.
 * Preferí `precioMensualPorSucursal` cuando hay módulos.
 */
export const PRECIO_POR_SUCURSAL = PRECIO_PEDIDOS;

export type ModulosFlags = {
  pedidos: boolean;
  espera: boolean;
};

/** Precio mensual por sucursal según módulos contratados. */
export const precioMensualPorSucursal = (m: ModulosFlags): number => {
  if (m.pedidos && m.espera) return PRECIO_PACK;
  if (m.pedidos) return PRECIO_PEDIDOS;
  if (m.espera) return PRECIO_ESPERA;
  return 0;
};

/** Cobro mensual = suma de lo contratado en cada sucursal. */
export const precioMensualSucursales = (lista: ModulosFlags[]): number =>
  lista.reduce((sum, m) => sum + precioMensualPorSucursal(m), 0);

/** Etiqueta corta del pack contratado. */
export const etiquetaModulos = (m: ModulosFlags): string => {
  if (m.pedidos && m.espera) return "Pedidos + Espera";
  if (m.pedidos) return "Solo pedidos";
  if (m.espera) return "Solo espera";
  return "Sin módulos";
};

/** Etiqueta del cobro cuando cada sucursal puede tener un pack distinto. */
export const etiquetaModulosSucursales = (lista: ModulosFlags[]): string => {
  if (!lista.length) return "Sin sucursales";
  const labels = lista.map(etiquetaModulos);
  const uniq = [...new Set(labels)];
  if (uniq.length === 1) {
    return lista.length === 1 ? uniq[0]! : `${uniq[0]} × ${lista.length}`;
  }
  return `Mixto · ${lista.length} sucursales`;
};

/** Normaliza flags: al menos un módulo activo. */
export const normalizarModulos = (m: Partial<ModulosFlags>): ModulosFlags => {
  const pedidos = m.pedidos !== false;
  const espera = Boolean(m.espera);
  if (!pedidos && !espera) return { pedidos: true, espera: false };
  return { pedidos, espera };
};
