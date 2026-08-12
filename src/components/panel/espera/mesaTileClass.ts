/* Extraído de app/(app)/panel/espera/page.tsx. Movido tal cual. */

import type { TableState } from "@/lib/types";

export const mesaTileClass = (
  status: TableState,
  opts?: {
    pickable?: boolean;
    selected?: boolean;
    /* En el modal de reserva el verde sobre verde casi no se ve: el borde
     * ámbar marca la elección sin confundirse con el choque (relleno ámbar). */
    selectedAmber?: boolean;
    tooSmall?: boolean;
    oversized?: boolean;
    /* Reserva lejana: borde ámbar sobre libre u ocupada. */
    conReserva?: boolean;
    /* Ventana de hold (antes del horario → fin de gracia): cuadrado entero. */
    reservaHold?: boolean;
    /** @deprecated prefer `conReserva` / `reservaHold` */
    reservaPronto?: boolean;
  },
) => {
  const base =
    "relative flex aspect-square flex-col items-center justify-center rounded-2xl border-2 text-center transition";
  if (opts?.reservaHold) {
    return `${base} border-amber-600 bg-amber-400 text-amber-950 shadow-sm ${
      opts.pickable
        ? "hover:bg-amber-500 active:scale-95"
        : "cursor-not-allowed"
    }`;
  }
  if (opts?.selected) {
    if (opts.selectedAmber) {
      return `${base} border-amber-500 bg-espera text-crema ring-2 ring-amber-400/70`;
    }
    return `${base} border-espera bg-espera text-crema ring-2 ring-espera/40`;
  }
  if (opts?.tooSmall && status === "libre") {
    return `${base} border-espera/30 bg-espera/15 text-espera/50 cursor-not-allowed`;
  }
  const marcaReserva = opts?.conReserva || opts?.reservaPronto;
  if (status === "libre") {
    return `${base} ${
      marcaReserva
        ? "border-amber-500 ring-2 ring-amber-400/55"
        : "border-espera"
    } bg-espera text-crema ${opts?.oversized ? "opacity-80" : ""} ${
      opts?.pickable ? "hover:bg-espera-fuerte active:scale-95" : ""
    }`;
  }
  return `${base} ${
    marcaReserva
      ? "border-amber-500 ring-2 ring-amber-400/55"
      : "border-rose-700"
  } bg-rose-600 text-white ${
    opts?.pickable === false ? "cursor-not-allowed opacity-70" : ""
  }`;
};
