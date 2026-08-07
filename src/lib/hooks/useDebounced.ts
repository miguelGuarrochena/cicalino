"use client";

import { useEffect, useState } from "react";

/* Retrasa un valor hasta que deja de cambiar por `ms`.
 *
 * Para el buscador del panel: la búsqueda pasó a resolverse en el servidor, y
 * sin esto cada tecla sería una consulta. */
export const useDebounced = <T,>(valor: T, ms = 300): T => {
  const [tardio, setTardio] = useState(valor);
  useEffect(() => {
    const id = window.setTimeout(() => setTardio(valor), ms);
    return () => window.clearTimeout(id);
  }, [valor, ms]);
  return tardio;
};
