"use client";

import { useCallback } from "react";
import { useApp } from "@/components/providers/Providers";
import { TOAST_AVISO_MS, useToast } from "@/components/ui/Toast";
import type { NotifyResult } from "@/lib/notify";

/* El resultado de avisar al cliente, contado igual en los dos módulos.
 *
 * Estaba escrito dos veces con las mismas tres ramas y una sola palabra de
 * diferencia: "marcado como listo" en pedidos, "marcado como avisado" en
 * sala. Las tres salidas dicen cosas distintas y hay que distinguirlas:
 *
 *  · falló         → el aviso no salió; se puede reintentar.
 *  · llegó a algún → el celular del cliente sonó.
 *  · nadie escuchó → el estado quedó bien guardado, pero no hay a dónde
 *                    avisar: hay que cantarlo. Este va con más tiempo en
 *                    pantalla, porque es el único que pide una acción.
 *
 * `null` significa que ni siquiera se pudo preguntar (5xx o rate limit); ahí
 * no se dice nada, para no tapar el toast de la acción que lo disparó.
 */
export const useAvisoToast = (
  marcadoComo: { es: string; en: string },
): ((r: NotifyResult | null) => void) => {
  const { locale } = useApp();
  const toast = useToast();

  return useCallback(
    (r: NotifyResult | null) => {
      if (!r) return;
      if (!r.ok) {
        toast(
          locale === "en"
            ? "Couldn’t notify. Check the connection and try again."
            : "No se pudo avisar. Revisá la conexión y probá de nuevo.",
          "error",
        );
        return;
      }
      if (r.delivered > 0) {
        toast(locale === "en" ? "Notified 🔔" : "Avisado 🔔", "success");
        return;
      }
      toast(
        locale === "en" ? marcadoComo.en : marcadoComo.es,
        "info",
        TOAST_AVISO_MS,
      );
    },
    [locale, toast, marcadoComo.es, marcadoComo.en],
  );
};
