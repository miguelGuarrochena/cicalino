import type { ModuleFlags } from "@/lib/pricing";

export type { ModuleFlags };

export type ModuleId = "pedidos" | "espera" | "pagos";

export type DeviceMode = "pedidos" | "espera" | "ambos";

/* Cómo funciona Pedidos en esta sucursal (locales.pedidos_modalidad).
 *
 *  mostrador     la caja carga el pedido y le da el QR al cliente. La de
 *                siempre.
 *  mesa          no hay mozo: el cliente escanea el QR fijo de su mesa, pide,
 *                paga (Mercado Pago o en caja) y retira en el mostrador. El
 *                pedido recién entra a preparación cuando está pago.
 *  mostrador_qr  un solo QR para todo el local (panadería, café, mostrador):
 *                el cliente pide desde el celular, el pedido entra a
 *                preparación enseguida y paga ahora (Mercado Pago) o al
 *                retirar (en caja). */
export type PedidosModalidad = "mostrador" | "mesa" | "mostrador_qr";

export const parsePedidosModalidad = (raw: unknown): PedidosModalidad =>
  raw === "mesa" || raw === "mostrador_qr" ? raw : "mostrador";

export const pedidosEnMesa = (
  m: Pick<ModuleFlags, "pedidos">,
  modalidad: PedidosModalidad,
): boolean => m.pedidos && modalidad === "mesa";

export const pedidosMostradorQr = (
  m: Pick<ModuleFlags, "pedidos">,
  modalidad: PedidosModalidad,
): boolean => m.pedidos && modalidad === "mostrador_qr";

/* El cliente pide solo desde un QR (el de su mesa o el del mostrador): hay
 * carta, cobros y una caja que cobra lo que se paga ahí. */
export const pedidosPorQr = (
  m: Pick<ModuleFlags, "pedidos">,
  modalidad: PedidosModalidad,
): boolean => pedidosEnMesa(m, modalidad) || pedidosMostradorQr(m, modalidad);

/* La carta, los métodos de cobro y la cuenta de Mercado Pago. Los usa Pagos,
 * y también Pedidos cuando el cliente pide desde un QR. Mismo criterio que
 * local_usa_carta en la base. */
export const usesTableMenu = (
  m: ModuleFlags,
  modalidad: PedidosModalidad,
): boolean => m.pagos || pedidosPorQr(m, modalidad);

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

/* ¿Este local necesita saber cuántas mesas tiene?
 *
 * La pregunta no la contesta el nombre de la sección. La cantidad de mesas la
 * usan tres cosas distintas: Recepción para sentar gente, Pagos para llevar la
 * cuenta de cada mesa, y Pedidos cuando identifica los pedidos por número de
 * mesa. Un local con Pedidos solo, en modo mesa, la necesita tanto como uno
 * con Recepción.
 *
 * Vive acá y no en la pantalla porque la misma respuesta la piden la sección,
 * la pestaña del nav y la validación del guardado. Cuando estaba escrita tres
 * veces, cambiarla era acordarse de los tres lugares. */
export const needsTableCount = (
  m: ModuleFlags,
  modoIdentificacion: string,
  modalidad: PedidosModalidad = "mostrador",
): boolean =>
  m.espera ||
  m.pagos ||
  (m.pedidos && modoIdentificacion === "mesa") ||
  pedidosEnMesa(m, modalidad);

export const hasBothModules = (m: ModuleFlags): boolean => m.pedidos && m.espera;

export const onlyModule = (m: ModuleFlags): ModuleId | null => {
  const on = (["pedidos", "espera", "pagos"] as const).filter((k) => m[k]);
  return on.length === 1 ? on[0]! : null;
};

export const modulePath = (id: ModuleId): string => {
  if (id === "pedidos") return "/panel/pedidos";
  if (id === "espera") return "/panel/espera";
  return "/panel/pagos";
};

/** Home del panel: un solo módulo va directo; si hay varios, el hub.
 * El modo del dispositivo solo elige dónde arranca, no esconde módulos. */
export const panelHomePath = (
  m: ModuleFlags,
  dispositivo: DeviceMode = "ambos",
): string => {
  const unico = onlyModule(m);
  if (unico) return modulePath(unico);
  if (dispositivo === "pedidos" && m.pedidos) return modulePath("pedidos");
  if (dispositivo === "espera" && m.espera) return modulePath("espera");
  if (m.pedidos || m.espera || m.pagos) return "/panel";
  return "/panel";
};
