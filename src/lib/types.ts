
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

export interface OrderView {
  id: string;
  referencia: string;
  estado: OrderStatus;
  createdAt: string;
  preparingAt: string | null;
  readyAt: string | null;
  pickedUpAt: string | null;
  cancelledAt: string | null;
  qrToken: string;
  empleado?: string | null;
  seenAt?: string | null;
}

export interface CustomerStatusView {
  referencia: string;
  estado: OrderStatus;
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
  nombre: string;
  personas: number;
  estado: WaitlistStatus;
  tableNumber: number | null;
  qrToken: string;
  createdAt: string;
  notifiedAt: string | null;
  seatedAt: string | null;
  cancelledAt: string | null;
  seenAt: string | null;
  empleado?: string | null;
}

export interface TableView {
  id: string;
  numero: number;
  estado: TableState;
  capacidad: number;
  waitlistId: string | null;
  reservationId: string | null;
}

export interface ReservationView {
  id: string;
  nombre: string;
  personas: number;
  tableNumber: number;
  tableNumbers: number[];
  horario: string;
  graceMinutes: 15 | 20;
  estado: ReservationStatus;
  createdAt: string;
  seatedAt: string | null;
  cancelledAt: string | null;
  expiredAt: string | null;
  empleado?: string | null;
}

export const WAITLIST_STATUS_LABEL: Record<WaitlistStatus, string> = {
  esperando: "Esperando",
  avisado: "Avisado",
  sentado: "Sentado",
  cancelado: "Cancelado",
};

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  activa: "Reservada",
  sentada: "Sentada",
  cancelada: "Cancelada",
  expirada: "No llegó",
};

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
