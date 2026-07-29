/** Tipos y helpers del producto multi-módulo (Pedidos / Espera). */

export type ModuloId = "pedidos" | "espera";

export type ModulosFlags = {
  pedidos: boolean;
  espera: boolean;
};

/** Preferencia de este dispositivo (localStorage). */
export type DispositivoModo = "pedidos" | "espera" | "ambos";

export const DEVICE_MODULO_KEY = "cicalino-dispositivo-modulo";

export const leerDispositivoModo = (): DispositivoModo => {
  if (typeof window === "undefined") return "ambos";
  const v = window.localStorage.getItem(DEVICE_MODULO_KEY);
  if (v === "pedidos" || v === "espera" || v === "ambos") return v;
  return "ambos";
};

export const guardarDispositivoModo = (modo: DispositivoModo): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEVICE_MODULO_KEY, modo);
};

/** Módulos visibles en este dispositivo dado lo contratado/activo en sucursal. */
export const modulosVisibles = (
  activos: ModulosFlags,
  dispositivo: DispositivoModo = "ambos",
): ModulosFlags => {
  if (dispositivo === "pedidos") {
    return { pedidos: activos.pedidos, espera: false };
  }
  if (dispositivo === "espera") {
    return { pedidos: false, espera: activos.espera };
  }
  return activos;
};

export const tieneAmbos = (m: ModulosFlags): boolean => m.pedidos && m.espera;

export const soloUno = (m: ModulosFlags): ModuloId | null => {
  if (m.pedidos && !m.espera) return "pedidos";
  if (m.espera && !m.pedidos) return "espera";
  return null;
};
