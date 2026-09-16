import type { ModuleFlags } from "@/lib/pricing";

export type { ModuleFlags };

export type ModuleId = "pedidos" | "espera" | "pagos";

export type DeviceMode = "pedidos" | "espera" | "ambos";

export const DEVICE_MODE_KEY = "cicalino-dispositivo-modulo";
export const DEVICE_MODE_EVENT = "cicalino-device-mode";

export const readDeviceMode = (): DeviceMode => {
  if (typeof window === "undefined") return "ambos";
  const v = window.localStorage.getItem(DEVICE_MODE_KEY);
  if (v === "pedidos" || v === "espera" || v === "ambos") return v;
  return "ambos";
};

export const saveDeviceMode = (modo: DeviceMode): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEVICE_MODE_KEY, modo);
  window.dispatchEvent(new Event(DEVICE_MODE_EVENT));
};

/**
 * Módulos visibles en este dispositivo.
 * Si la sucursal solo contrató uno, ignoramos el modo guardado en localStorage
 * (puede quedar "pedidos" de otra sucursal y dejar la UI en cero módulos).
 *
 * The device preference only splits the counter (pedidos) from the host stand
 * (espera). Table bills are visible wherever the module is contracted: any
 * device can be the one a waiter uses to confirm a payment.
 */
export const visibleModules = (
  activos: ModuleFlags,
  dispositivo: DeviceMode = "ambos",
): ModuleFlags => {
  const pagos = activos.pagos;
  if (activos.pedidos && !activos.espera) {
    return { pedidos: true, espera: false, pagos };
  }
  if (activos.espera && !activos.pedidos) {
    return { pedidos: false, espera: true, pagos };
  }
  if (dispositivo === "pedidos") {
    return { pedidos: activos.pedidos, espera: false, pagos };
  }
  if (dispositivo === "espera") {
    return { pedidos: false, espera: activos.espera, pagos };
  }
  return activos;
};

export const hasBothModules = (m: ModuleFlags): boolean => m.pedidos && m.espera;

export const onlyModule = (m: ModuleFlags): ModuleId | null => {
  const on = (["pedidos", "espera", "pagos"] as const).filter((k) => m[k]);
  return on.length === 1 ? on[0]! : null;
};

/** Home del panel según módulos visibles. */
export const panelHomePath = (m: ModuleFlags): string => {
  if (m.pedidos) return "/panel";
  if (m.espera) return "/panel/espera";
  if (m.pagos) return "/panel/mesas";
  return "/panel";
};
