"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useApp } from "@/components/providers/Providers";
import {
  copyTrackingLink,
  shareTrackingLink,
  type LinkFeedback,
} from "@/lib/trackingLink";

/* El link individual de un pedido: copiarlo, compartirlo o, si el navegador
 * no deja ninguna de las dos, verlo entero para copiarlo a mano.
 *
 * El link ES el acceso al pedido (un token largo y al azar): quien lo tiene ve
 * ese pedido y nada más. Por eso se explica que se comparte con quien lo va a
 * retirar, y no se promete que quede "guardado": copiar deja el link en el
 * portapapeles, compartir lo manda a donde el cliente elija, y un favorito lo
 * agrega el cliente en su navegador. Ninguna de las tres cosas la puede hacer
 * la página por su cuenta. */

type Feedback = LinkFeedback | null;

const noSubscribe = () => () => {};
const canShare = () =>
  typeof navigator !== "undefined" && typeof navigator.share === "function";

export const TrackingLink = ({
  path,
  reference,
  lostHint,
  className = "",
}: {
  /* Ruta del pedido (`/p/<token>` o `/m/<token>`); el origen sale del navegador. */
  path: string;
  reference?: string | null;
  /* Qué hacer si se pierde el link: depende de la modalidad. */
  lostHint: string;
  className?: string;
}) => {
  const { t } = useApp();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const share = useSyncExternalStore(noSubscribe, canShare, () => false);
  const url = useSyncExternalStore(
    noSubscribe,
    () => `${window.location.origin}${path}`,
    () => path,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (feedback !== "copiado" && feedback !== "compartido") return;
    const id = window.setTimeout(() => setFeedback(null), 4000);
    return () => window.clearTimeout(id);
  }, [feedback]);

  useEffect(() => {
    if (feedback === "manual") inputRef.current?.select();
  }, [feedback]);

  const copiar = async () => {
    setFeedback(await copyTrackingLink(url, navigator.clipboard));
  };

  const compartir = async () => {
    const r = await shareTrackingLink(
      {
        title: t("enlace.compartirTitulo"),
        text: reference ? t("enlace.compartirTexto", { n: reference }) : undefined,
        url,
      },
      navigator.share?.bind(navigator),
    );
    if (r) setFeedback(r);
  };

  return (
    <section
      aria-labelledby="enlace-titulo"
      className={`flex flex-col gap-3 rounded-2xl border border-linea bg-surface p-4 ${className}`}
    >
      <div>
        <h2 id="enlace-titulo" className="text-base font-semibold text-carbon">
          {t("enlace.titulo")}
        </h2>
        <p className="mt-0.5 text-sm text-suave">{t("enlace.cuerpo")}</p>
      </div>
      <div className={`grid gap-2 ${share ? "grid-cols-2" : "grid-cols-1"}`}>
        <button
          type="button"
          onClick={() => void copiar()}
          className="min-h-12 rounded-full border-2 border-marca px-4 text-base font-semibold text-marca"
        >
          {t("enlace.copiar")}
        </button>
        {share && (
          <button
            type="button"
            onClick={() => void compartir()}
            className="min-h-12 rounded-full border-2 border-marca px-4 text-base font-semibold text-marca"
          >
            {t("enlace.compartir")}
          </button>
        )}
      </div>
      <p role="status" aria-live="polite" className="min-h-0 text-sm font-semibold text-ok empty:hidden">
        {feedback === "copiado" ? t("enlace.copiado") : feedback === "compartido" ? t("enlace.compartido") : ""}
      </p>
      {feedback === "manual" && (
        <label className="flex flex-col gap-1 text-sm text-suave">
          {t("enlace.manual")}
          <input
            ref={inputRef}
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="min-h-11 w-full rounded-xl border border-linea bg-crema px-3 text-sm text-carbon"
          />
        </label>
      )}
      <details className="text-sm text-suave">
        <summary className="cursor-pointer font-semibold text-carbon">{t("enlace.comoGuardar")}</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
          <li>{t("enlace.guardarFavorito")}</li>
          <li>{t("enlace.privado")}</li>
          <li>{lostHint}</li>
        </ul>
      </details>
    </section>
  );
};
