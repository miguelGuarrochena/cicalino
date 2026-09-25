"use client";

import { useApp } from "@/components/providers/Providers";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { InformativeQrCard } from "@/components/panel/mesas/InformativeQrCard";
import { printAccentFor, type InformativeQrFlow } from "@/lib/qrInformativo";
import { useConfigStore } from "@/lib/store/config-store";

export type QrDownloadKind = "solo" | "marco";

/* Descargar un QR impreso (o una plancha): solo el código o con instrucciones.
 *
 * Es también lo que se abre apenas se regenera uno (useQrRegeneration): con
 * `notice` dice que es el QR nuevo y qué pasó con el anterior, y con
 * `onPrint` suma imprimir, para no tener que salir a buscarlo. */
export const QrDownloadModal = ({
  title,
  previewSrc,
  venue,
  tableLabel,
  busy,
  flow = "cuenta",
  notice,
  onPrint,
  printLabel,
  onPick,
  onClose,
}: {
  title: string;
  previewSrc: string;
  venue: string;
  tableLabel: string;
  busy: boolean;
  flow?: InformativeQrFlow;
  /* Recién regenerado: qué cambió y qué hay que reimprimir. */
  notice?: string;
  /* Imprimir lo mismo que se ve (un cartel o toda la plancha). */
  onPrint?: () => void;
  printLabel?: string;
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
      {notice && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-ok-borde bg-ok-fondo px-3 py-2 text-sm font-medium text-ok"
        >
          {notice}
        </p>
      )}

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
            {flow === "mostrador_qr"
              ? t("mostradorQr.qr.descargarMarcoHint")
              : flow === "autoservicio"
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

      {(onPrint || notice) && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          {onPrint && (
            <button
              type="button"
              disabled={busy}
              onClick={onPrint}
              className="min-h-11 rounded-full bg-marca px-5 text-sm font-semibold text-crema disabled:opacity-50"
            >
              {printLabel ?? t("qr.imprimir")}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-11 rounded-full border border-linea px-5 text-sm font-semibold text-carbon/70 disabled:opacity-50"
          >
            {t("mesasQr.listo")}
          </button>
        </div>
      )}
    </ModalShell>
  );
};
