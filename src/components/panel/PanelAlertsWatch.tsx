"use client";

import { usePanelAlertsWatch } from "@/lib/hooks/usePanelAlerts";

/* Mantiene viva la escucha de todos los módulos desde cualquier pantalla del
 * panel, y con ella el sonido. Va montado en el layout, al lado de los otros
 * vigilantes, para que ninguna sección tenga que acordarse de encenderlo. */
export const PanelAlertsWatch = () => {
  usePanelAlertsWatch();
  return null;
};
