import type { OrderView } from "@/lib/types";

export const ordersDemo = (): OrderView[] => {
  const ahora = Date.now();
  const iso = (msAtras: number) => new Date(ahora - msAtras).toISOString();
  const min = 60_000;

  return [
    {
      id: "1",
      referencia: "42",
      estado: "creado",
      createdAt: iso(1 * min),
      preparingAt: null,
      readyAt: null,
      pickedUpAt: null,
      cancelledAt: null,
      qrToken: "demo-token",
      empleado: "Lucía",
    },
    {
      id: "2",
      referencia: "Sofia",
      estado: "creado",
      createdAt: iso(6 * min),
      preparingAt: null,
      readyAt: null,
      pickedUpAt: null,
      cancelledAt: null,
      qrToken: "tok-sofia",
      empleado: "Marcos",
    },
    {
      id: "3",
      referencia: "41",
      estado: "listo",
      createdAt: iso(12 * min),
      preparingAt: iso(10 * min),
      readyAt: iso(2 * min),
      pickedUpAt: null,
      cancelledAt: null,
      qrToken: "tok-41",
      empleado: "Lucía",
    },
    {
      id: "4",
      referencia: "Martin",
      estado: "retirado",
      createdAt: iso(20 * min),
      preparingAt: iso(18 * min),
      readyAt: iso(9 * min),
      pickedUpAt: iso(6 * min),
      cancelledAt: null,
      qrToken: "tok-martin",
      empleado: "Marcos",
    },
    {
      id: "5",
      referencia: "Ana",
      estado: "cancelado",
      createdAt: iso(35 * min),
      preparingAt: null,
      readyAt: null,
      pickedUpAt: null,
      cancelledAt: iso(28 * min),
      qrToken: "tok-ana",
      empleado: "Lucía",
    },
  ];
};
