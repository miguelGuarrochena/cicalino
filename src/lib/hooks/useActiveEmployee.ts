"use client";

import { useEffect } from "react";
import {
  fichajeVigente,
  useSessionStore,
  type ActiveEmployee,
} from "@/lib/store/session-store";
import { useConfigStore } from "@/lib/store/config-store";

/* El empleado fichado, o null si el fichaje ya es de otra jornada.
 *
 * Se deriva en el render en vez de vivir en un timer: el panel se re-renderiza
 * todo el tiempo mientras hay servicio (el refresco de pedidos y el reloj de
 * las tarjetas), así que el vencimiento se nota solo. El corte cae a una hora
 * en la que el local está cerrado, no en medio del mostrador.
 *
 * Cuando detecta uno vencido lo limpia del store para que el botón vuelva a
 * decir "Fichar" y no quede un nombre viejo guardado en el dispositivo. */
export const useActiveEmployee = (): ActiveEmployee | null => {
  const emp = useSessionStore((s) => s.empleadoActivo);
  const salir = useSessionStore((s) => s.salir);
  const cutoffHour = useConfigStore((s) => s.cutoffHour);

  const vigente = fichajeVigente(emp, cutoffHour);

  useEffect(() => {
    if (emp && !vigente) salir();
  }, [emp, vigente, salir]);

  return vigente ? emp : null;
};
