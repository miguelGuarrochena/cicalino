"use client";

import { useApp } from "@/components/providers/Providers";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";

export type QrDownloadKind = "solo" | "marco";

export const QrDownloadModal = ({
  title,
  previewSrc,
  venue,
  tableLabel,
  busy,
  onPick,
  onClose,
}: {
  title: string;
  previewSrc: string;
  venue: string;
  tableLabel: string;
  busy: boolean;
  onPick: (kind: QrDownloadKind) => void;
  onClose: () => void;
}) => {
  const { t } = useApp();
  return (
    <ModalShell
      onClose={onClose}
      labelledBy="qr-descarga-title"
      busy={busy}
      busyLabel={t("mesasQr.armando")}
      wide
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="qr-descarga-title"
            className="font-display text-2xl uppercase tracking-tight text-carbon"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm text-carbon/55">{t("mesasQr.elegiDescarga")}</p>
        </div>
        <ModalCloseBtn
          onClick={onClose}
          disabled={busy}
          label={t("mesa.cerrar")}
        />
      </div>

      {/* Title first so both labels share a row. The framed preview is taller;
          if the copy sits under it, "Solo QR" drops to the bottom of the card. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start">
        <button
          type="button"
          disabled={busy}
          onClick={() => onPick("solo")}
          className="flex flex-col rounded-[20px] border-2 border-linea bg-surface p-3 text-left transition hover:border-marca disabled:opacity-50"
        >
          <span className="font-display text-lg uppercase tracking-tight text-carbon">
            {t("mesasQr.descargarSolo")}
          </span>
          <span className="mt-0.5 text-sm text-carbon/55">
            {t("mesasQr.descargarSoloHint")}
          </span>
          <div className="mt-3 flex aspect-square items-center justify-center rounded-2xl bg-white p-4 ring-1 ring-linea">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewSrc} alt="" className="w-full" />
          </div>
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => onPick("marco")}
          className="flex flex-col rounded-[20px] border-2 border-linea bg-surface p-3 text-left transition hover:border-marca disabled:opacity-50"
        >
          <span className="font-display text-lg uppercase tracking-tight text-carbon">
            {t("mesasQr.descargarMarco")}
          </span>
          <span className="mt-0.5 text-sm text-carbon/55">
            {t("mesasQr.descargarMarcoHint")}
          </span>
          <div className="mt-3 flex aspect-[3/4] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-400 bg-white px-3 py-3 text-center">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-gray-500">
              {venue}
            </p>
            <p className="font-display text-base uppercase text-[#1b29b0]">
              {tableLabel}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewSrc} alt="" className="mt-1 w-[72%]" />
            <p className="mt-1 line-clamp-2 text-[9px] font-medium text-gray-500">
              {t("mesasQr.instruccion")}
            </p>
          </div>
        </button>
      </div>
    </ModalShell>
  );
};
