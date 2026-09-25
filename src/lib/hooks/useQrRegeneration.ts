"use client";

import { useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useConfirm } from "@/components/ui/Confirm";
import { useToast } from "@/components/ui/Toast";

/* Regenerar un QR impreso (mesa, mostrador, o varios a la vez) siempre sigue
 * los mismos pasos: confirmar, regenerar en la base (que es la que invalida
 * el anterior, con sus reglas), volver a leer y entregar el QR nuevo para
 * ofrecer imprimirlo o descargarlo en el acto (QrDownloadModal). Cada pantalla
 * pone qué regenerar y qué hacer con el resultado; esto pone el orden.
 *
 * Los QR de un pedido o de un grupo en espera no se regeneran: son el link del
 * cliente y cambiarlos le cortaría el seguimiento. */

export type QrRegenerationSteps<R> = {
  /* Pregunta al usuario. false = no se hace nada. */
  confirm: () => Promise<boolean>;
  /* Llama a la base. true si regeneró. */
  run: () => Promise<boolean>;
  /* Vuelve a leer lo regenerado (con las imágenes nuevas). */
  refresh: () => Promise<R>;
  /* Recibe lo nuevo: acá se abre el modal de imprimir/descargar. */
  onFresh: (fresh: R) => void;
  onError: () => void;
};

/* La secuencia, sin React: se puede probar sola. */
export const regenerateThenOffer = async <R>(steps: QrRegenerationSteps<R>): Promise<boolean> => {
  if (!(await steps.confirm())) return false;
  try {
    if (!(await steps.run())) {
      steps.onError();
      return false;
    }
    steps.onFresh(await steps.refresh());
    return true;
  } catch {
    steps.onError();
    return false;
  }
};

export const useQrRegeneration = () => {
  const { t } = useApp();
  const confirmar = useConfirm();
  const toast = useToast();
  const [regenerando, setRegenerando] = useState(false);

  const regenerar = async <R>(opts: {
    title: string;
    body: string;
    run: () => Promise<boolean>;
    refresh: () => Promise<R>;
    onFresh: (fresh: R) => void;
  }): Promise<boolean> => {
    if (regenerando) return false;
    setRegenerando(true);
    try {
      return await regenerateThenOffer({
        confirm: () =>
          confirmar({
            title: opts.title,
            body: opts.body,
            confirmLabel: t("mesasQr.regenerarSi"),
            cancelLabel: t("acciones.volver"),
            tone: "peligro",
          }),
        run: opts.run,
        refresh: opts.refresh,
        onFresh: opts.onFresh,
        onError: () => toast(t("mesas.error.error"), "error"),
      });
    } finally {
      setRegenerando(false);
    }
  };

  return { regenerar, regenerando };
};
