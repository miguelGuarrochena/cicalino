"use client";

import { useEffect, useState } from "react";
import { isJornadaActiva, TZ_NEGOCIO } from "@/lib/businessDay";
import { useConfigStore } from "@/lib/store/config-store";

/* ¿El local tiene operación ahora?
 *
 * Se recalcula cada minuto para que el corte de un franco (lunes 6:00) apague
 * las pantallas sin esperar a que alguien recargue. */
export const useJornadaActiva = (): boolean => {
  const cutoffHour = useConfigStore((s) => s.cutoffHour);
  const diasCerrados = useConfigStore((s) => s.diasCerrados);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return isJornadaActiva(
    cutoffHour,
    new Date(ahora),
    TZ_NEGOCIO,
    diasCerrados,
  );
};
