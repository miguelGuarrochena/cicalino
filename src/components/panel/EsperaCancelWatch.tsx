"use client";

import { useEsperaCancelWatch } from "@/lib/hooks/useEsperaCancelWatch";

/** Escucha cancelaciones de espera en todo el panel (toast + sonido). */
export const EsperaCancelWatch = () => {
  useEsperaCancelWatch();
  return null;
};
