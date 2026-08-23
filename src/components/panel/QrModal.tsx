"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useApp } from "@/components/providers/Providers";
import { useBrowserValue } from "@/lib/hooks/useBrowserValue";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";

interface Props {
  reference: string;
  alias?: string | null;
  token: string;
  etiqueta: string;
  onClose: () => void;
  onCancelar?: () => void;
  pathPrefix?: "/p" | "/e";
  accent?: "pedidos" | "espera";
}

export const QrModal = ({
  reference: reference,
  alias,
  token,
  etiqueta,
  onClose,
  onCancelar,
  pathPrefix = "/p",
  accent = "pedidos",
}: Props) => {
  const { t, locale } = useApp();
  const [dataUrl, setDataUrl] = useState("");
  const [copiado, setCopiado] = useState(false);
  const puedeCompartir = useBrowserValue(
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    false,
  );
  const [confirmCancel, setConfirmCancel] = useState(false);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}${pathPrefix}/${token}`
      : `https://cicalino.net${pathPrefix}/${token}`;

  const darkColor = accent === "espera" ? "#0f766e" : "#2536d4";
  const accentClass = accent === "espera" ? "text-espera" : "text-marca";
  const btnClass =
    accent === "espera"
      ? "bg-espera hover:bg-espera-fuerte"
      : "bg-marca hover:bg-marca-fuerte";

  useEffect(() => {
    QRCode.toDataURL(url, {
      margin: 1,
      width: 320,
      errorCorrectionLevel: "H",
      color: { dark: darkColor, light: "#ffffff" },
    })
      .then(setDataUrl)
      .catch(() => {});
  }, [url, darkColor]);

  const waText =
    pathPrefix === "/e"
      ? locale === "en"
        ? `Follow your table wait on Cicalino: ${url}`
        : `Seguí tu espera de mesa en Cicalino: ${url}`
      : `Seguí tu pedido en Cicalino: ${url}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(waText)}`;

  const copiar = async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1800);
        } catch {
        }
      };

  const compartir = async () => {
        try {
          await navigator.share({
            title: "Cicalino",
            text:
              pathPrefix === "/e"
                ? locale === "en"
                  ? "Follow your table wait"
                  : "Seguí tu espera de mesa"
                : "Seguí tu pedido",
            url,
          });
        } catch {
        }
      };

  return (
    <ModalShell onClose={onClose} labelledBy="qr-modal-title">
      <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-carbon/40">
              {etiqueta}
            </p>
            <p id="qr-modal-title" className="font-display text-3xl leading-none text-carbon">
              {reference}
            </p>
            {alias ? (
              <p className="mt-1 text-sm font-semibold text-marca">{alias}</p>
            ) : null}
          </div>
          <ModalCloseBtn onClick={onClose} label={t("qr.cerrar")} />
        </div>

        <div className="flex flex-col items-center">
          <div className="relative rounded-2xl bg-white p-3 shadow-sm">
            {dataUrl ? (
              <>
                {/* next/image no aplica: el QR es un data: URL que genera la
                    librería en el navegador con el token de este pedido. No
                    hay archivo que optimizar ni URL que servir. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dataUrl} alt="QR" className="size-52" />
                <span className="absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-white shadow-sm ring-2 ring-white">
                  <svg viewBox="0 0 512 512" className={`size-8 ${accentClass}`} fill="currentColor" aria-hidden="true">
                    <circle cx="256" cy="118" r="22" />
                    <path d="M256 134 C184 134 150 196 150 264 C150 336 132 356 106 384 C95 396 104 414 120 414 L392 414 C408 414 417 396 406 384 C380 356 362 336 362 264 C362 196 328 134 256 134 Z" />
                    <path d="M304 436 a48 44 0 0 1 -96 0 z" />
                  </svg>
                </span>
              </>
            ) : (
              <div className="size-52 animate-pulse rounded-lg bg-carbon/5" />
            )}
          </div>
          <p className="mt-3 text-center text-sm text-carbon/60">
            {t("qr.escanea")}
          </p>
        </div>

        <div className="mt-5 border-t border-linea pt-4">
          <p className="mb-3 text-center text-xs text-carbon/50">
            {t("qr.sinCamara")}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 active:scale-95"
            >
              {t("qr.whatsapp")}
            </a>
            {puedeCompartir && (
              <button
                onClick={compartir}
                className={`rounded-full ${btnClass} px-4 py-2.5 text-sm font-semibold text-crema transition active:scale-95`}
              >
                {t("qr.compartir")}
              </button>
            )}
            <button
              onClick={copiar}
              className="rounded-full border border-linea px-4 py-2.5 text-sm font-semibold text-carbon transition hover:bg-carbon/5 active:scale-95"
            >
              {copiado ? `✓ ${t("qr.copiado")}` : t("qr.copiar")}
            </button>
          </div>
        </div>

        {onCancelar && (
          <div className="mt-4 border-t border-linea pt-3 text-center">
            {confirmCancel ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onCancelar}
                  className="flex-1 rounded-full bg-red-500 text-white transition hover:bg-red-600 flex min-h-11 items-center justify-center px-4 text-sm font-semibold sm:min-h-0 sm:py-2 sm:text-xs"
                >
                  {locale === "en" ? "Yes, cancel" : "Sí, cancelar"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmCancel(false)}
                  className="flex-1 rounded-full border border-linea text-carbon/60 transition hover:bg-carbon/5 flex min-h-11 items-center justify-center px-4 text-sm font-semibold sm:min-h-0 sm:py-2 sm:text-xs"
                >
                  {locale === "en" ? "Keep it" : "No, dejarlo"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="text-xs font-semibold text-red-600/70 transition hover:text-red-600"
              >
                {t("card.marcarCancelado")}
              </button>
            )}
          </div>
        )}
    </ModalShell>
  );
};
