/* Extraído de app/(app)/panel/espera/page.tsx. Movido tal cual. */

import type { TableState } from "@/lib/types";

export const mesaTileClass = (
  status: TableState,
  opts?: {
    pickable?: boolean;
    selected?: boolean;
    tooSmall?: boolean;
    oversized?: boolean;
    reservaPronto?: boolean;
  },
) => {
  const base =
    "relative flex aspect-square flex-col items-center justify-center rounded-2xl border-2 text-center transition";
  if (opts?.selected) {
    return `${base} border-espera bg-espera text-crema ring-2 ring-espera/40`;
  }
  if (opts?.tooSmall && status === "libre") {
    return `${base} border-espera/30 bg-espera/15 text-espera/50 cursor-not-allowed`;
  }
  if (status === "libre") {
    return `${base} ${
      opts?.reservaPronto
        ? "border-amber-500 ring-2 ring-amber-400/50"
        : "border-espera"
    } bg-espera text-crema ${opts?.oversized ? "opacity-80" : ""} ${
      opts?.pickable ? "hover:bg-espera-fuerte active:scale-95" : ""
    }`;
  }
  return `${base} border-rose-700 bg-rose-600 text-white ${
    opts?.pickable === false ? "cursor-not-allowed opacity-70" : ""
  }`;
};
