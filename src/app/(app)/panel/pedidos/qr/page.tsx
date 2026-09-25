"use client";

import { TableQrManager } from "@/components/panel/mesas/TableQrManager";

/* Pedidos en modalidad Mesa: el QR fijo de cada mesa, con el cartel de
 * "Confirmá tu pedido" (pedí, pagá, retirá en el mostrador). */
const PedidosQrPage = () => <TableQrManager flow="autoservicio" />;

export default PedidosQrPage;
