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

const byAge = (a: KitchenTicket, b: KitchenTicket) =>
  a.createdAt.localeCompare(b.createdAt);

/* Dos pilas, la más vieja primero. Lo que todavía no mandó el mostrador
 * no entra: cocina no ve un pedido hasta que alguien lo manda. */
export const kitchenLanes = (tickets: KitchenTicket[]) => ({
  preparando: tickets.filter((t) => !t.doneAt).sort(byAge),
  hecha: tickets.filter((t) => t.doneAt).sort(byAge),
});
