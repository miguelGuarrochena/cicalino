"use client";

import { useCallback } from "react";
import { useApp } from "@/components/providers/Providers";
import { TOAST_AVISO_MS, useToast } from "@/components/ui/Toast";
import { avisoToastKind, type NotifyResult } from "@/lib/notify";

/* El resultado de avisar al cliente, contado igual en Pedidos y Recepción.
 *
 * No importa el canal: push o la página del QR. Al mostrador solo le
 * importa si el cliente pudo enterarse.
 *
 *  · falló         → el aviso no salió; se puede reintentar.
 *  · avisado       → push entregado o el cliente abrió el QR (visto_en).
 *  · no se pudo    → ningún canal tenía a quién avisarle. Hay que cantarlo.
 *                    Este va con más tiempo en pantalla, porque pide acción.
 *
 * `null` significa que ni siquiera se pudo preguntar (5xx o rate limit); ahí
 * no se dice nada, para no tapar el toast de la acción que lo disparó.
 */
export const useAvisoToast = (): ((
  r: NotifyResult | null,
  seenAt?: string | null,
) => void) => {
  const { locale } = useApp();
  const toast = useToast();

  return useCallback(
    (r: NotifyResult | null, seenAt?: string | null) => {
      const kind = avisoToastKind(r, seenAt);
      if (kind === "silent") return;
      if (kind === "error") {
        toast(
          locale === "en"
            ? "Couldn’t notify. Check the connection and try again."
            : "No se pudo avisar. Revisá la conexión y probá de nuevo.",
          "error",
        );
        return;
      }
      if (kind === "ok") {
        toast(locale === "en" ? "Notified 🔔" : "Avisado 🔔", "success");
        return;
      }
      toast(
        locale === "en"
          ? "⚠️ Couldn’t notify the customer. Try again or call them in person."
          : "⚠️ No se pudo avisar al cliente. Intentá de nuevo o llamalo personalmente.",
        "info",
        TOAST_AVISO_MS,
      );
    },
    [locale, toast],
  );
};
