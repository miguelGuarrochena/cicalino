"use client";

import { TableQrManager } from "@/components/panel/mesas/TableQrManager";
import { CounterQrManager } from "@/components/panel/pedidos/CounterQrManager";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";

/* El QR de Pedidos según la modalidad:
 *   Mesa          el QR fijo de cada mesa, con el cartel de "Confirmá tu
 *                 pedido" (pedí, pagá, retirá en el mostrador).
 *   Mostrador QR  un solo QR para todo el local, con el cartel de "Pedí desde
 *                 tu celular". */
const PedidosQrPage = () => {
  const { pedidosMostradorQr } = useOperationalAccess();
  return pedidosMostradorQr ? <CounterQrManager /> : <TableQrManager flow="autoservicio" />;
};

export default PedidosQrPage;
