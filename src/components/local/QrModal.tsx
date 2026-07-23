"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useApp } from "@/components/providers/Providers";
import { ModalShell } from "@/components/ui/ModalShell";

interface Props {
  referencia: string;
  token: string;
  etiqueta: string;
  onClose: () => void;
}

// Modal que muestra el QR de un pedido para que el cliente lo escanee, con
// fallback para mandar el link (WhatsApp / compartir / copiar) si no anda la camara.
export const QrModal = ({ referencia, token, etiqueta, onClose }: Props) => {
  const { t } = useApp();
  const [dataUrl, setDataUrl] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [puedeCompartir, setPuedeCompartir] = useState(false);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/p/${token}`
      : `https://cicalino.ar/p/${token}`;

  useEffect(() => {
    QRCode.toDataURL(url, {
      margin: 1,
      width: 320,
      errorCorrectionLevel: "H",
      color: { dark: "#2536d4", light: "#ffffff" },
    })
      .then(setDataUrl)
      .catch(() => {});
    setPuedeCompartir(
      typeof navigator !== "undefined" && typeof navigator.share === "function",
    );
  }, [url]);

  const waHref = `https://wa.me/?text=${encodeURIComponent(
    `Seguí tu pedido en Cicalino: ${url}`,
  )}`;

  const copiar = async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1800);
        } catch {
          /* noop */
        }
      };

  const compartir = async () => {
        try {
          await navigator.share({ title: "Cicalino", text: "Seguí tu pedido", url });
        } catch {
          /* cancelado */
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
              {referencia}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("qr.cerrar")}
            className="flex size-9 items-center justify-center rounded-full border border-linea text-carbon/50 transition hover:bg-carbon/5"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col items-center">
          <div className="relative rounded-2xl bg-white p-3 shadow-sm">
            {dataUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dataUrl} alt="QR" className="size-52" />
                <span className="absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-white shadow-sm ring-2 ring-white">
                  <svg viewBox="0 0 512 512" className="size-8 text-marca" fill="currentColor" aria-hidden="true">
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
                className="rounded-full bg-marca px-4 py-2.5 text-sm font-semibold text-crema transition hover:bg-marca-fuerte active:scale-95"
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
    </ModalShell>
  );
};
