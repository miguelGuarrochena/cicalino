/* La pantalla de cocina y la comanda impresa son el mismo pedido.
 * imprimir es el flujo de siempre (copiar y "ya lo anoté").
 * pantalla: el mostrador manda la comanda, cocina marca hecha y el
 * mostrador marca listo al llevarla. El cliente se entera en ese paso. */

export type CocinaModo = "imprimir" | "pantalla";

export const parseCocinaModo = (v: unknown): CocinaModo =>
  v === "pantalla" ? "pantalla" : "imprimir";

export type KitchenStatus = "creado" | "en_preparacion" | "listo";

export type KitchenLane = "preparando" | "hecha";

export interface KitchenTicket {
  id: string;
  reference: string;
  alias: string | null;
  status: KitchenStatus;
  createdAt: string;
  readyAt: string | null;
  /* Cocina terminó. El estado sigue en en_preparacion: el cliente no ve listo. */
  doneAt: string | null;
  tableNumber: number | null;
  items: { name: string; quantity: number; option?: string | null; note?: string | null }[];
}

/* La sección que lleva la comanda cuando cocina termina. La decide el flujo
 * de la sesión: `cuenta` es Pagos; `autoservicio` (Pedidos Mesa) y
 * `mostrador_qr` son Pedidos, igual que todo pedido sin sesión. Si la sesión
 * no vino en la lectura, `autoservicio` del pedido dice lo mismo: la base lo
 * copia de la sesión al crearlo, y es la regla del tablero de Pedidos
 * (`sesion_id is null or autoservicio`). */
export type KitchenSection = "pedidos" | "pagos";

export const kitchenSection = (o: {
  sessionId: string | null;
  flow: string | null;
  selfService: boolean;
}): KitchenSection => {
  if (!o.sessionId) return "pedidos";
  if (o.flow) return o.flow === "cuenta" ? "pagos" : "pedidos";
  return o.selfService ? "pedidos" : "pagos";
};

/* Lo mínimo de cada comanda en cocina para los globos del panel. */
export interface KitchenQueueItem {
  id: string;
  reference: string;
  createdAt: string;
  doneAt: string | null;
  tableNumber: number | null;
  where: KitchenSection;
}

/* pendientes: lo que cocina tiene que preparar (la pila «Preparando»).
 * hechas: lo que terminó y espera que su sección lo lleve. */
export const splitKitchenQueue = (items: KitchenQueueItem[]) => ({
  pendientes: items.filter((i) => !i.doneAt),
  hechas: items.filter((i) => i.doneAt),
});

const byAge = (a: KitchenTicket, b: KitchenTicket) =>
  a.createdAt.localeCompare(b.createdAt);

/* Dos pilas, la más vieja primero. Lo que todavía no mandó el mostrador
 * no entra: cocina no ve un pedido hasta que alguien lo manda. */
export const kitchenLanes = (tickets: KitchenTicket[]) => ({
  preparando: tickets.filter((t) => !t.doneAt).sort(byAge),
  hecha: tickets.filter((t) => t.doneAt).sort(byAge),
});
