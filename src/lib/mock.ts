import type { OrderView } from "@/lib/types";

export const ordersDemo = (): OrderView[] => {
  const ahora = Date.now();
  const iso = (msAtras: number) => new Date(ahora - msAtras).toISOString();
  const min = 60_000;

  return [
    {
      id: "1",
      reference: "42",
      alias: "Miguel",
      status: "creado",
      createdAt: iso(1 * min),
      preparingAt: null,
      readyAt: null,
      pickedUpAt: null,
      cancelledAt: null,
      qrToken: "demo-token",
      employee: "Lucía",
    },
    {
      id: "2",
      reference: "Sofia",
      status: "creado",
      createdAt: iso(6 * min),
      preparingAt: null,
      readyAt: null,
      pickedUpAt: null,
      cancelledAt: null,
      qrToken: "tok-sofia",
      employee: "Marcos",
    },
    {
      id: "3",
      reference: "41",
      status: "listo",
      createdAt: iso(12 * min),
      preparingAt: iso(10 * min),
      readyAt: iso(2 * min),
      pickedUpAt: null,
      cancelledAt: null,
      qrToken: "tok-41",
      employee: "Lucía",
    },
    {
      id: "4",
      reference: "Martin",
      status: "retirado",
      createdAt: iso(20 * min),
      preparingAt: iso(18 * min),
      readyAt: iso(9 * min),
      pickedUpAt: iso(6 * min),
      cancelledAt: null,
      qrToken: "tok-martin",
      employee: "Marcos",
    },
    {
      id: "5",
      reference: "Ana",
      status: "cancelado",
      createdAt: iso(35 * min),
      preparingAt: null,
      readyAt: null,
      pickedUpAt: null,
      cancelledAt: iso(28 * min),
      qrToken: "tok-ana",
      employee: "Lucía",
    },
  ];
};
