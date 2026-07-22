import type { PedidoVista } from "@/lib/types";

// Datos de ejemplo para los prototipos, mientras no hay base conectada.
export const pedidosDemo = (): PedidoVista[] => {
  const ahora = Date.now();
  const iso = (msAtras: number) => new Date(ahora - msAtras).toISOString();
  const min = 60_000;

  return [
    {
      id: "1",
      referencia: "42",
      estado: "creado",
      creadoEn: iso(1 * min),
      enPreparacionEn: null,
      listoEn: null,
      retiradoEn: null,
      canceladoEn: null,
      qrToken: "demo-token",
      empleado: "Lucía",
    },
    {
      id: "2",
      referencia: "Sofia",
      estado: "creado",
      creadoEn: iso(6 * min),
      enPreparacionEn: null,
      listoEn: null,
      retiradoEn: null,
      canceladoEn: null,
      qrToken: "tok-sofia",
      empleado: "Marcos",
    },
    {
      id: "3",
      referencia: "41",
      estado: "listo",
      creadoEn: iso(12 * min),
      enPreparacionEn: iso(10 * min),
      listoEn: iso(2 * min),
      retiradoEn: null,
      canceladoEn: null,
      qrToken: "tok-41",
      empleado: "Lucía",
    },
    {
      id: "4",
      referencia: "Martin",
      estado: "retirado",
      creadoEn: iso(20 * min),
      enPreparacionEn: iso(18 * min),
      listoEn: iso(9 * min),
      retiradoEn: iso(6 * min),
      canceladoEn: null,
      qrToken: "tok-martin",
      empleado: "Marcos",
    },
    {
      id: "5",
      referencia: "Ana",
      estado: "cancelado",
      creadoEn: iso(35 * min),
      enPreparacionEn: null,
      listoEn: null,
      retiradoEn: null,
      canceladoEn: iso(28 * min),
      qrToken: "tok-ana",
      empleado: "Lucía",
    },
  ];
};
