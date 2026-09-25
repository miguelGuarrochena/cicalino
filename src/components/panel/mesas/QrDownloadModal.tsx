"use client";

import { useApp } from "@/components/providers/Providers";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { InformativeQrCard } from "@/components/panel/mesas/InformativeQrCard";
import { printAccentFor, type InformativeQrFlow } from "@/lib/qrInformativo";
import { useConfigStore } from "@/lib/store/config-store";

export type QrDownloadKind = "solo" | "marco";

export const QrDownloadModal = ({
  title,
  previewSrc,
  venue,
  tableLabel,
  busy,
  flow = "cuenta",
  onPick,
  onClose,
}: {
  title: string;
  previewSrc: string;
  venue: string;
  tableLabel: string;
  busy: boolean;
  flow?: InformativeQrFlow;
  onPick: (kind: QrDownloadKind) => void;
  onClose: () => void;
}) => {
  const { t } = useApp();
  const colorMarca = useConfigStore((s) => s.colorMarca);
  const accent = printAccentFor(colorMarca);

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

      {/* Title first so both labels share a row. The informative preview is
          wider; if the copy sits under it, "Solo QR" drops to the bottom. */}
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
            {flow === "autoservicio"
              ? t("retiroQr.descargarMarcoHint")
              : t("mesasQr.descargarMarcoHint")}
          </span>
          <div className="mt-3 aspect-[180/102] overflow-hidden rounded-2xl bg-white ring-1 ring-linea">
            <InformativeQrCard
              qrSrc={previewSrc}
              venue={venue}
              tableLabel={tableLabel}
              accent={accent}
              flow={flow}
            />
          </div>
        </button>
      </div>
    </ModalShell>
  );
};
