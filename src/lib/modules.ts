
export type ModuleId = "pedidos" | "espera";

export type ModuleFlags = {
  pedidos: boolean;
  espera: boolean;
};

export type DeviceMode = "pedidos" | "espera" | "ambos";

export const DEVICE_MODE_KEY = "cicalino-dispositivo-modulo";

export const readDeviceMode = (): DeviceMode => {
  if (typeof window === "undefined") return "ambos";
  const v = window.localStorage.getItem(DEVICE_MODE_KEY);
  if (v === "pedidos" || v === "espera" || v === "ambos") return v;
  return "ambos";
};

export const saveDeviceMode = (modo: DeviceMode): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEVICE_MODE_KEY, modo);
};

/**
 * Módulos visibles en este dispositivo.
 * Si la sucursal solo contrató uno, ignoramos el modo guardado en localStorage
 * (puede quedar "pedidos" de otra sucursal y dejar la UI en cero módulos).
 */
export const visibleModules = (
  activos: ModuleFlags,
  dispositivo: DeviceMode = "ambos",
): ModuleFlags => {
  if (activos.pedidos && !activos.espera) {
    return { pedidos: true, espera: false };
  }
  if (activos.espera && !activos.pedidos) {
    return { pedidos: false, espera: true };
  }
  if (dispositivo === "pedidos") {
    return { pedidos: activos.pedidos, espera: false };
  }
  if (dispositivo === "espera") {
    return { pedidos: false, espera: activos.espera };
  }
  return activos;
};

export const hasBothModules = (m: ModuleFlags): boolean => m.pedidos && m.espera;

export const onlyModule = (m: ModuleFlags): ModuleId | null => {
  if (m.pedidos && !m.espera) return "pedidos";
  if (m.espera && !m.pedidos) return "espera";
  return null;
};

/** Home del panel según módulos visibles. */
export const panelHomePath = (m: ModuleFlags): string =>
  !m.pedidos && m.espera ? "/panel/espera" : "/panel";
