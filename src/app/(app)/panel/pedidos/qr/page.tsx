"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TableQrManager } from "@/components/panel/mesas/TableQrManager";
import { CounterQrManager } from "@/components/panel/pedidos/CounterQrManager";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";

/* Los QR de Pedidos. Mesa y el mostrador QR son independientes, así que un
 * local puede tener los dos:
 *   ?de=mesas      el QR fijo de cada mesa, con el cartel de "Confirmá tu
 *                  pedido" (pedí, pagá, retirá en el mostrador).
 *   ?de=mostrador  un solo QR para todo el local, con el cartel de "Pedí
 *                  desde tu celular".
 * Sin `de` (links viejos), el que haya; si hay los dos, el del mostrador. */
const QrSegunModalidad = () => {
  const { pedidosMostradorQr, pedidosEnMesa } = useOperationalAccess();
  const de = useSearchParams().get("de");
  const mesas = de === "mesas" ? pedidosEnMesa : de === "mostrador" ? false : !pedidosMostradorQr;
  return mesas ? <TableQrManager flow="autoservicio" /> : <CounterQrManager />;
};

/* useSearchParams necesita un Suspense para que Next pueda prerenderizar. */
const PedidosQrPage = () => (
  <Suspense fallback={null}>
    <QrSegunModalidad />
  </Suspense>
);

export default PedidosQrPage;
