// Tipos de dominio compartidos entre el panel del local y la vista del cliente.
// Los tipos de fila de la base viven en lib/db/schema.ts; aca van los tipos
// de la capa de UI / API (lo que viaja al cliente, sin datos sensibles).

export type OrderStatus =
  | "creado"
  | "en_preparacion"
  | "listo"
  | "retirado"
  | "cancelado";

export type TipoNegocio =
  | "cafeteria"
  | "panaderia"
  | "rotiseria"
  | "heladeria"
  | "bar"
  | "restaurante"
  | "pasteleria"
  | "food_truck"
  | "otro";

export const TIPO_NEGOCIO_LABEL: Record<TipoNegocio, string> = {
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

export const TIPOS_NEGOCIO = Object.keys(TIPO_NEGOCIO_LABEL) as TipoNegocio[];

// Lo que ve el panel del local por cada pedido.
export interface OrderView {
  id: string;
  referencia: string;
  estado: OrderStatus;
  creadoEn: string; // ISO
  enPreparacionEn: string | null;
  listoEn: string | null;
  retiradoEn: string | null;
  canceladoEn: string | null;
  qrToken: string;
  empleado?: string | null; // nombre del empleado que lo atendió
  vistoEn?: string | null; // cuándo el cliente abrió el link (para cerrar el QR)
}

// Lo minimo que necesita la pantalla del cliente (sin exponer datos internos).
export interface CustomerStatusView {
  referencia: string;
  estado: OrderStatus;
  nombreLocal: string;
  listo: boolean;
}

// Metricas del dia para el dashboard del local.
export interface MetricasDia {
  fecha: string;
  totalPedidos: number;
  tiempoPrepPromedioMin: number | null;
  tiempoRetiroPromedioMin: number | null;
  pedidosPorHora: { hora: number; cantidad: number }[];
}

export const ETIQUETA_ESTADO: Record<OrderStatus, string> = {
  creado: "En curso",
  en_preparacion: "En curso",
  listo: "Listo",
  retirado: "Retirado",
  cancelado: "Cancelado",
};

export const orderClosed = (status: OrderStatus): boolean => {
  return status === "retirado" || status === "cancelado";
};

// ---------------------------------------------------------------------------
// Espera de mesa
// ---------------------------------------------------------------------------

export type EsperaStatus = "esperando" | "avisado" | "sentado" | "cancelado";

export type MesaEstado = "libre" | "ocupada" | "reservada";

export type ReservaStatus = "activa" | "sentada" | "cancelada" | "expirada";

export interface EsperaView {
  id: string;
  nombre: string;
  personas: number;
  estado: EsperaStatus;
  mesaNumero: number | null;
  qrToken: string;
  creadoEn: string;
  avisadoEn: string | null;
  sentadoEn: string | null;
  canceladoEn: string | null;
  vistoEn: string | null;
  empleado?: string | null;
}

export interface MesaView {
  id: string;
  numero: number;
  estado: MesaEstado;
  esperaId: string | null;
  reservaId: string | null;
}

export interface ReservaView {
  id: string;
  nombre: string;
  personas: number;
  mesaNumero: number;
  horario: string;
  graciaMinutos: 15 | 20;
  estado: ReservaStatus;
  creadoEn: string;
  sentadoEn: string | null;
  canceladoEn: string | null;
  expiradoEn: string | null;
  empleado?: string | null;
}

export const ETIQUETA_ESPERA: Record<EsperaStatus, string> = {
  esperando: "Esperando",
  avisado: "Avisado",
  sentado: "Sentado",
  cancelado: "Cancelado",
};

export const ETIQUETA_RESERVA: Record<ReservaStatus, string> = {
  activa: "Reservada",
  sentada: "Sentada",
  cancelada: "Cancelada",
  expirada: "No llegó",
};

export const esperaClosed = (status: EsperaStatus): boolean =>
  status === "sentado" || status === "cancelado";

export const reservaClosed = (status: ReservaStatus): boolean =>
  status === "sentada" || status === "cancelada" || status === "expirada";
