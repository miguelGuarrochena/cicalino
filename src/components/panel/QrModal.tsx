"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { useApp } from "@/components/providers/Providers";
import { useBrowserValue } from "@/lib/hooks/useBrowserValue";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { PrintableQr } from "@/components/panel/PrintableQr";

interface Props {
  reference: string;
  alias?: string | null;
  token: string;
  etiqueta: string;
  onClose: () => void;
  onCancelar?: () => void;
  pathPrefix?: "/p" | "/e" | "/m";
  accent?: "pedidos" | "espera";
  venueName?: string;
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
  venueName,
}: Props) => {
  const { t, locale } = useApp();
  const [dataUrl, setDataUrl] = useState("");
  /* El QR del papel no es el de la pantalla.
   *
   * En pantalla va en el color de la marca y a 320 px, que es lo que entra en
   * el modal. Impreso, 320 px estirados a 68 mm quedan blandos —una impresora
   * trabaja a 300 dpi o más— y el color lo convierte a grises punteados, que
   * es justo lo que le cuesta leer a una cámara. Negro puro y 1024 px: el
   * sticker tiene que escanear a la primera desde el borde de la mesa. */
  const [printUrl, setPrintUrl] = useState("");
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

  useEffect(() => {
    QRCode.toDataURL(url, {
      margin: 2,
      width: 1024,
      errorCorrectionLevel: "H",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then(setPrintUrl)
      .catch(() => {});
  }, [url]);

  const venue = venueName?.trim() || "Cicalino";

  const waText =
    pathPrefix === "/e"
      ? locale === "en"
        ? `Follow your table wait on Cicalino: ${url}`
        : `Seguí tu espera de mesa en Cicalino: ${url}`
      : pathPrefix === "/m"
        ? t("qr.mesaWa", { bar: venue, url })
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
            title: venue,
            text:
              pathPrefix === "/e"
                ? locale === "en"
                  ? "Follow your table wait"
                  : "Seguí tu espera de mesa"
                : pathPrefix === "/m"
                  ? t("qr.mesaShare", { bar: venue })
                  : "Seguí tu pedido",
            url,
          });
        } catch {
        }
      };

  /* Imprimir sin abrir nada.
   *
   * El papel ya está en el documento (PrintableQr, oculto en pantalla). Lo
   * único que falta es que, mientras dure el diálogo de impresión, el resto
   * del documento no exista para el papel: eso lo hace la marca en <body>,
   * que la hoja de estilos usa para esconder todo lo que no sea el sticker.
   *
   * Va así y no con `print:hidden` en cada ancestro —como hace la cuenta de
   * la mesa— porque este modal se abre desde varias pantallas y vive en un
   * portal aparte: pedirle a cada página que se acuerde de marcarse sería
   * pedirle a alguien que se olvide. */
  const imprimir = () => {
    if (!printUrl) return;
    document.body.dataset.imprimiendo = "qr";
    window.print();
  };

  useEffect(() => {
    const limpiar = () => {
      delete document.body.dataset.imprimiendo;
    };
    /* `afterprint` cubre imprimir y cancelar. El desmontaje cubre al que
     * cierra el modal con el diálogo todavía abierto. */
    window.addEventListener("afterprint", limpiar);
    return () => {
      window.removeEventListener("afterprint", limpiar);
      limpiar();
    };
  }, []);

  const papel =
    typeof document === "undefined"
      ? null
      : createPortal(
          <PrintableQr
            dataUrl={printUrl}
            reference={reference}
            etiqueta={etiqueta}
            venueName={pathPrefix === "/m" ? venue : venueName}
            hint={pathPrefix === "/m" ? t("qr.mesaEscanea") : t("qr.escanea")}
          />,
          document.body,
        );

  return (
    <>
      {papel}
    <ModalShell onClose={onClose} labelledBy="qr-modal-title">
      <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-carbon/40">
              {pathPrefix === "/m" && venueName?.trim() ? venue : etiqueta}
            </p>
            <div
              id="qr-modal-title"
              className="grid min-h-8 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2"
            >
              <span className="font-display text-3xl leading-none text-carbon">
                {reference}
              </span>
              {alias ? (
                <span className="truncate font-display text-lg leading-none text-marca">
                  {alias}
                </span>
              ) : null}
            </div>
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
            {pathPrefix === "/m" ? t("qr.mesaEscanea") : t("qr.escanea")}
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
            <button
              type="button"
              onClick={imprimir}
              className="rounded-full border border-linea px-4 py-2.5 text-sm font-semibold text-carbon transition hover:bg-carbon/5 active:scale-95"
            >
              {t("qr.imprimir")}
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
    </>
  );
};
