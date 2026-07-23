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
  | "otro";

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
