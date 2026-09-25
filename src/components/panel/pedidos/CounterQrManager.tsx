"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { useApp } from "@/components/providers/Providers";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import { useSessionStore } from "@/lib/store/session-store";
import { useConfigStore } from "@/lib/store/config-store";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { MascotLoader } from "@/components/ui/MascotLoader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SubPageHeader } from "@/components/panel/SubPageHeader";
import { InformativeQrCard } from "@/components/panel/mesas/InformativeQrCard";
import {
  QrDownloadModal,
  type QrDownloadKind,
} from "@/components/panel/mesas/QrDownloadModal";
import { downloadDataUrl, framedQrPng } from "@/lib/qrSticker";
import {
  INFORMATIVE_QR_MM,
  PRINT_QR_OPTIONS,
  informativeQrCopy,
  printAccentFor,
} from "@/lib/qrInformativo";
import { fetchCounterQr, regenerateCounterQr } from "@/lib/data/pickup";

type Qr = { url: string; image: string; printImage: string };

/* El QR en pantalla (azul) y el de imprimir (negro), del token vigente. */
const buildQr = async (branchId: string): Promise<Qr | null> => {
  const res = await fetchCounterQr(branchId);
  if (!res.ok || !res.data) return null;
  const url = `${window.location.origin}/m/${res.data.token}`;
  const [image, printImage] = await Promise.all([
    QRCode.toDataURL(url, {
      margin: 2,
      width: 600,
      errorCorrectionLevel: "H",
      color: { dark: "#1b29b0", light: "#ffffff" },
    }),
    QRCode.toDataURL(url, PRINT_QR_OPTIONS),
  ]);
  return { url, image, printImage };
};

const noSubscribe = () => () => {};

/* El QR de Pedidos en modalidad Mostrador QR: uno solo para todo el local.
 *
 * Identifica la entrada, no un pedido: cada teléfono que lo escanea arma su
 * propio pedido. Mismo generador, cartel y descarga que los QR de las mesas
 * (InformativeQrCard + qrSticker), con el texto del mostrador. Regenerarlo
 * invalida el cartel impreso, igual que en las mesas. */
export const CounterQrManager = () => {
  const { t } = useApp();
  const toast = useToast();
  const confirmar = useConfirm();
  const branchId = useSessionStore((s) => s.sucursalId);
  const branchName = useConfigStore((s) => s.name);
  const colorMarca = useConfigStore((s) => s.colorMarca);
  const { canManage, ready, pedidosMostradorQr } = useOperationalAccess();
  const accent = printAccentFor(colorMarca);
  const venue = branchName.trim() || "Cicalino";
  const label = t("mostradorQr.cartel.etiqueta");
  /* undefined = cargando; null = no se pudo leer. `version` vuelve a leer
   * (reintentar, o después de regenerar). */
  const [qr, setQr] = useState<Qr | null | undefined>(undefined);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [download, setDownload] = useState(false);
  const onClient = useSyncExternalStore(noSubscribe, () => true, () => false);

  useEffect(() => {
    if (!pedidosMostradorQr || !branchId) return;
    let alive = true;
    buildQr(branchId)
      .catch(() => null)
      .then((next) => {
        if (alive) setQr(next);
      });
    return () => {
      alive = false;
    };
  }, [branchId, pedidosMostradorQr, version]);

  const reload = () => setVersion((v) => v + 1);

  useEffect(() => {
    const before = () => {
      document.body.dataset.imprimiendo = "qr";
    };
    const after = () => {
      delete document.body.dataset.imprimiendo;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
      after();
    };
  }, []);

  const regenerate = async () => {
    if (!branchId || busy) return;
    const ok = await confirmar({
      title: t("mostradorQr.qr.regenerarTitulo"),
      body: t("mostradorQr.qr.regenerarCuerpo"),
      confirmLabel: t("mesasQr.regenerarSi"),
      cancelLabel: t("acciones.volver"),
      tone: "peligro",
    });
    if (!ok) return;
    setBusy(true);
    const done = await regenerateCounterQr(branchId);
    setBusy(false);
    if (done) {
      toast(t("mostradorQr.qr.regenerado"), "success");
      reload();
    } else {
      toast(t("mesas.error.error"), "error");
    }
  };

  const runDownload = async (kind: QrDownloadKind) => {
    if (!qr) return;
    setBusy(true);
    try {
      if (kind === "solo") {
        downloadDataUrl(qr.image, "cicalino-mostrador-qr.png");
      } else {
        downloadDataUrl(
          await framedQrPng({
            qrDataUrl: qr.printImage,
            venue,
            tableLabel: label,
            copy: informativeQrCopy(t, "mostrador_qr"),
            accent,
            number: 0,
          }),
          "cicalino-mostrador-qr-cartel.png",
        );
      }
      setDownload(false);
    } catch {
      toast(t("mesasQr.errorDescarga"), "error");
    } finally {
      setBusy(false);
    }
  };

  if (!ready || !pedidosMostradorQr) return null;
  if (qr === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <MascotLoader className="h-16" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SubPageHeader
        volverA="/panel/pedidos"
        volverLabel={t("nav.pedidos")}
        titulo={t("mostradorQr.qr.titulo")}
        sub={t("mostradorQr.qr.sub")}
      />

      {!qr ? (
        <EmptyState
          title={t("mesasQr.errorCarga")}
          action={
            <button
              type="button"
              onClick={reload}
              className="min-h-11 rounded-full bg-marca px-5 text-sm font-semibold text-crema"
            >
              {t("mesasQr.reintentar")}
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:items-start">
          <div className="flex flex-col rounded-[20px] border border-marca/35 bg-surface p-4 ring-1 ring-marca/15">
            <p className="font-display text-2xl uppercase text-carbon">{label}</p>
            {/* El data: URL lo genera la librería en el navegador. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.image} alt={t("mostradorQr.qr.alt")} className="mt-3 w-full self-center" />
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDownload(true)}
                className="min-h-11 rounded-full bg-marca px-4 text-sm font-semibold text-crema disabled:opacity-50"
              >
                {t("mesasQr.descargar")}
              </button>
              <button
                type="button"
                onClick={() => window.setTimeout(() => window.print(), 50)}
                className="min-h-11 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/75"
              >
                {t("mesasQr.imprimir")}
              </button>
              {canManage && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void regenerate()}
                  className="min-h-11 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/60 disabled:opacity-50"
                >
                  {t("mesasQr.regenerar")}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-carbon/70">{t("mostradorQr.qr.vistaCartel")}</p>
            <div className="aspect-[180/102] w-full overflow-hidden rounded-2xl bg-white ring-1 ring-linea">
              <InformativeQrCard
                qrSrc={qr.printImage}
                venue={venue}
                tableLabel={label}
                accent={accent}
                flow="mostrador_qr"
              />
            </div>
            <p className="text-xs text-carbon/50">{t("mostradorQr.qr.cartelAyuda")}</p>
          </div>
        </div>
      )}

      {download && qr ? (
        <QrDownloadModal
          title={t("mostradorQr.qr.titulo")}
          previewSrc={qr.image}
          venue={venue}
          tableLabel={label}
          busy={busy}
          flow="mostrador_qr"
          onPick={(kind) => void runDownload(kind)}
          onClose={() => {
            if (!busy) setDownload(false);
          }}
        />
      ) : null}

      {onClient && qr
        ? createPortal(
            <div data-imprimible="qr" aria-hidden className="hidden print:block">
              <article
                className="mx-auto break-inside-avoid"
                style={{
                  width: `${INFORMATIVE_QR_MM.w}mm`,
                  height: `${INFORMATIVE_QR_MM.h}mm`,
                }}
              >
                <InformativeQrCard
                  qrSrc={qr.printImage}
                  venue={venue}
                  tableLabel={label}
                  accent={accent}
                  flow="mostrador_qr"
                />
              </article>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};
