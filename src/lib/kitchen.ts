/* La pantalla de cocina y la comanda impresa son el mismo pedido.
 * imprimir es el flujo de siempre (copiar y "ya lo anoté").
 * pantalla lo mueve cocina: nueva → preparando → lista. */

export type CocinaModo = "imprimir" | "pantalla";

export const parseCocinaModo = (v: unknown): CocinaModo =>
  v === "pantalla" ? "pantalla" : "imprimir";

export type KitchenStatus = "creado" | "en_preparacion" | "listo";

export type KitchenLane = "nueva" | "preparando" | "lista";

export interface KitchenTicket {
  id: string;
  reference: string;
  alias: string | null;
  status: KitchenStatus;
  createdAt: string;
  readyAt: string | null;
  tableNumber: number | null;
  items: { name: string; quantity: number }[];
}

export const laneOf = (status: KitchenStatus): KitchenLane =>
  status === "creado" ? "nueva" : status === "en_preparacion" ? "preparando" : "lista";

const byAge = (a: KitchenTicket, b: KitchenTicket) =>
  a.createdAt.localeCompare(b.createdAt);

/* Tres pilas, la más vieja primero: cocina trabaja en orden de llegada. */
export const kitchenLanes = (tickets: KitchenTicket[]) => ({
  nueva: tickets.filter((t) => t.status === "creado").sort(byAge),
  preparando: tickets.filter((t) => t.status === "en_preparacion").sort(byAge),
  lista: tickets.filter((t) => t.status === "listo").sort(byAge),
});

export const nextKitchenStatus = (
  lane: "nueva" | "preparando",
): KitchenStatus => (lane === "nueva" ? "en_preparacion" : "listo");
