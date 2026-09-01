
export type OrderStatus =
  | "creado"
  | "en_preparacion"
  | "listo"
  | "retirado"
  | "cancelado";

export type BusinessType =
  | "cafeteria"
  | "panaderia"
  | "rotiseria"
  | "heladeria"
  | "bar"
  | "restaurante"
  | "pasteleria"
  | "food_truck"
  | "otro";

export const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  cafeteria: "Cafetería",
  panaderia: "Panadería",
  rotiseria: "Rotisería",
  heladeria: "Heladería",
  bar: "Bar",
  restaurante: "Restaurante",
  pasteleria: "Pastelería",
  food_truck: "Food truck",
  otro: "Otro",
};

export const BUSINESS_TYPES = Object.keys(BUSINESS_TYPE_LABEL) as BusinessType[];

/* Los mapas de arriba quedan en castellano porque la consola de Superadmin es
 * interna y no tiene selector de idioma. Lo que ve el local pasa por estos
 * helpers, que siguen la misma forma que `tablesTitle` más abajo. */
const BUSINESS_TYPE_EN: Record<BusinessType, string> = {
  cafeteria: "Coffee shop",
  panaderia: "Bakery",
  rotiseria: "Deli",
  heladeria: "Ice cream shop",
  bar: "Bar",
  restaurante: "Restaurant",
  pasteleria: "Pastry shop",
  food_truck: "Food truck",
  otro: "Other",
};

export const businessTypeLabel = (
  tipo: BusinessType,
  locale: "es" | "en" = "es",
): string =>
  (locale === "en" ? BUSINESS_TYPE_EN[tipo] : BUSINESS_TYPE_LABEL[tipo]) ?? tipo;

export interface OrderView {
  id: string;
  reference: string;
  alias?: string | null;
  status: OrderStatus;
  createdAt: string;
  preparingAt: string | null;
  readyAt: string | null;
  pickedUpAt: string | null;
  cancelledAt: string | null;
  qrToken: string;
  employee?: string | null;
  /* Cuándo el cliente abrió el QR por primera vez. null = nunca lo escaneó. */
  seenAt?: string | null;
  /* Si dejó los avisos activos en el celular. Junto con `seenAt` es lo que
   * le dice al mostrador si este pedido se va a avisar solo o hay que
   * cantarlo. Lo cuenta `pedidos_pagina`; un alta nueva arranca en false. */
  hasPush?: boolean;
}

export interface CustomerStatusView {
  reference: string;
  status: OrderStatus;
  branchName: string;
  listo: boolean;
}

export interface DailyMetrics {
  fecha: string;
  totalPedidos: number;
  tiempoPrepPromedioMin: number | null;
  tiempoRetiroPromedioMin: number | null;
  pedidosPorHora: { hora: number; cantidad: number }[];
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  creado: "En curso",
  en_preparacion: "En curso",
  listo: "Listo",
  retirado: "Retirado",
  cancelado: "Cancelado",
};

export const orderClosed = (status: OrderStatus): boolean => {
  return status === "retirado" || status === "cancelado";
};

export type WaitlistStatus = "esperando" | "avisado" | "sentado" | "cancelado";

export type TableState = "libre" | "ocupada";

export type ReservationStatus = "activa" | "sentada" | "cancelada" | "expirada";

export interface WaitlistView {
  id: string;
  name: string;
  partySize: number;
  status: WaitlistStatus;
  tableNumber: number | null;
  qrToken: string;
  createdAt: string;
  notifiedAt: string | null;
  seatedAt: string | null;
  cancelledAt: string | null;
  seenAt: string | null;
  employee?: string | null;
}

export interface TableView {
  id: string;
  number: number;
  status: TableState;
  capacity: number;
  waitlistId: string | null;
  reservationId: string | null;
}

export interface ReservationView {
  id: string;
  name: string;
  partySize: number;
  tableNumber: number;
  tableNumbers: number[];
  scheduledAt: string;
  graceMinutes: 15 | 20;
  status: ReservationStatus;
  createdAt: string;
  seatedAt: string | null;
  cancelledAt: string | null;
  expiredAt: string | null;
  employee?: string | null;
}

export const WAITLIST_STATUS_LABEL: Record<WaitlistStatus, string> = {
  esperando: "Esperando",
  avisado: "Avisado",
  sentado: "Sentado",
  cancelado: "Cancelado",
};

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  activa: "Reservada",
  sentada: "Cumplida",
  cancelada: "Cancelada",
  expirada: "No cumplida",
};

const WAITLIST_STATUS_EN: Record<WaitlistStatus, string> = {
  esperando: "Waiting",
  avisado: "Notified",
  sentado: "Seated",
  cancelado: "Cancelled",
};

const RESERVATION_STATUS_EN: Record<ReservationStatus, string> = {
  activa: "Booked",
  sentada: "Honoured",
  cancelada: "Cancelled",
  expirada: "No-show",
};

export const waitlistStatusLabel = (
  status: WaitlistStatus,
  locale: "es" | "en" = "es",
): string =>
  locale === "en"
    ? WAITLIST_STATUS_EN[status]
    : WAITLIST_STATUS_LABEL[status];

export const reservationStatusLabel = (
  status: ReservationStatus,
  locale: "es" | "en" = "es",
): string =>
  locale === "en"
    ? RESERVATION_STATUS_EN[status]
    : RESERVATION_STATUS_LABEL[status];

export const waitlistClosed = (status: WaitlistStatus): boolean =>
  status === "sentado" || status === "cancelado";

export const reservationClosed = (status: ReservationStatus): boolean =>
  status === "sentada" || status === "cancelada" || status === "expirada";

export const tableNumbersLabel = (nums: number[]): string => {
  const sorted = [...new Set(nums)].filter((n) => n >= 1).sort((a, b) => a - b);
  return sorted.join(" + ") || "—";
};

export const tablesTitle = (
  nums: number[],
  locale: "es" | "en" = "es",
): string => {
  const sorted = [...new Set(nums)].filter((n) => n >= 1).sort((a, b) => a - b);
  const label = sorted.join(" + ");
  if (!sorted.length) return locale === "en" ? "Table" : "Mesa";
  if (sorted.length === 1) {
    return locale === "en" ? `Table ${label}` : `Mesa ${label}`;
  }
  return locale === "en" ? `Tables ${label}` : `Mesas ${label}`;
};
