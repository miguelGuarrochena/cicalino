"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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
import { QrDownloadModal } from "@/components/panel/mesas/QrDownloadModal";
import type { QrDownloadKind } from "@/components/panel/mesas/QrDownloadModal";
import {
  downloadDataUrl,
  framedQrPng,
  sheetPng,
  type StickerCard,
} from "@/lib/qrSticker";
import {
  INFORMATIVE_QR_MM,
  PRINT_QR_OPTIONS,
  informativeQrCopy,
  printAccentFor,
} from "@/lib/qrInformativo";
import {
  fetchTableQrs,
  regenerateTableQr,
  setTableQrs,
  type TableQrView,
} from "@/lib/data/tables";

type WithImage = TableQrView & {
  url: string;
  image: string | null;
  printImage: string | null;
};

const QrMark = ({ on }: { on: boolean }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
      on ? "bg-ok-fondo text-ok" : "bg-carbon/8 text-carbon/45"
    }`}
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v6M14 20h3" />
    </svg>
    QR
  </span>
);

/* El QR fijo de cada mesa, para imprimir.
 *
 * Lo usan dos flujos con el mismo QR y distinto cartel:
 *   cuenta        Pagos: pedí y pagá desde la mesa, con mozo. Cada mesa tiene
 *                 QR solo si alguien lo activa.
 *   autoservicio  Pedidos en modalidad Mesa: pedí, pagá y retirá en el
 *                 mostrador. Todas las mesas tienen QR, no hay que activar. */
export type TableQrFlow = "cuenta" | "autoservicio";

export const TableQrManager = ({ flow }: { flow: TableQrFlow }) => {
  const { t } = useApp();
  const autoservicio = flow === "autoservicio";
  const toast = useToast();
  const confirmar = useConfirm();
  const branchId = useSessionStore((s) => s.sucursalId);
  const branchName = useConfigStore((s) => s.name);
  const colorMarca = useConfigStore((s) => s.colorMarca);
  const { visibles, canManage, ready, pedidosEnMesa } = useOperationalAccess();
  const enabled = autoservicio ? pedidosEnMesa : visibles.pagos;
  const copy = informativeQrCopy(t, flow);
  const accent = printAccentFor(colorMarca);
  const [tables, setTables] = useState<WithImage[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printIds, setPrintIds] = useState<Set<string> | null>(null);
  const [onClient, setOnClient] = useState(false);
  const [download, setDownload] = useState<
    null | { kind: "one"; table: WithImage } | { kind: "sheet"; tables: WithImage[] }
  >(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    const res = await fetchTableQrs(branchId);
    if (!res.ok) {
      setTables([]);
      setLoadError(true);
      return;
    }
    setLoadError(false);
    const origin = window.location.origin;
    const withImages = await Promise.all(
      res.data
        /* En modalidad Mesa todas las mesas tienen QR (mesa_por_qr no mira
         * qr_activo): no hay nada que activar. */
        .map((m) => (autoservicio ? { ...m, qrActive: true } : m))
        .map(async (m) => {
        const url = `${origin}/m/${m.qrToken}`;
        if (!m.qrActive) return { ...m, url, image: null, printImage: null };
        const [image, printImage] = await Promise.all([
          QRCode.toDataURL(url, {
            margin: 2,
            width: 600,
            errorCorrectionLevel: "H",
            color: { dark: "#1b29b0", light: "#ffffff" },
          }),
          QRCode.toDataURL(url, PRINT_QR_OPTIONS),
        ]);
        return { ...m, url, image, printImage };
      }),
    );
    setTables(withImages);
  }, [branchId, autoservicio]);

  useEffect(() => {
    if (enabled) void load();
  }, [load, enabled]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const idsOrNull = (all: boolean) => {
    if (all || !tables) return null;
    return [...selected];
  };

  const apply = async (active: boolean, all: boolean) => {
    if (!branchId || busy) return;
    const ids = idsOrNull(all);
    if (!all && (!ids || ids.length === 0)) {
      toast(t("mesasQr.elegiMesas"), "error");
      return;
    }
    setBusy(true);
    const res = await setTableQrs(branchId, active, ids);
    setBusy(false);
    if (res.ok) {
      toast(active ? t("mesasQr.activados") : t("mesasQr.desactivados"), "success");
      setSelected(new Set());
      await load();
    } else {
      toast(t("mesas.error.error"), "error");
    }
  };

  const regenerate = async (m: WithImage) => {
    const ok = await confirmar({
      title: t("mesasQr.regenerarTitulo"),
      body: t("mesasQr.regenerarConfirmar", { n: m.number }),
      confirmLabel: t("mesasQr.regenerarSi"),
      cancelLabel: t("acciones.volver"),
      tone: "peligro",
    });
    if (!ok) return;
    setBusy(true);
    const res = await regenerateTableQr(m.id);
    setBusy(false);
    if (res.ok) {
      toast(t("mesasQr.regenerado", { n: m.number }), "success");
      await load();
    } else {
      toast(t("mesas.error.error"), "error");
    }
  };

  const stickerOf = (m: WithImage, qr: string | null): StickerCard | null => {
    if (!qr) return null;
    return {
      qrDataUrl: qr,
      venue: branchName.trim() || "Cicalino",
      tableLabel: t("mesa.mesaN", { n: m.number }),
      copy,
      accent,
      number: m.number,
    };
  };

  useEffect(() => {
    setOnClient(true);
    const before = () => {
      document.body.dataset.imprimiendo = "qr";
    };
    const after = () => {
      delete document.body.dataset.imprimiendo;
      setPrintIds(null);
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
      after();
    };
  }, []);

  const openSheet = (fromSelected: boolean) => {
    if (!tables) return;
    const list = (
      fromSelected && selected.size
        ? tables.filter((m) => selected.has(m.id) && m.qrActive && m.image)
        : tables.filter((m) => m.qrActive && m.image)
    );
    if (!list.length) {
      toast(t("mesasQr.nadaParaDescargar"), "error");
      return;
    }
    setDownload({ kind: "sheet", tables: list });
  };

  const runDownload = async (kind: QrDownloadKind) => {
    if (!download) return;
    setBusy(true);
    try {
      if (download.kind === "one") {
        if (kind === "solo") {
          if (!download.table.image) return;
          downloadDataUrl(
            download.table.image,
            `cicalino-mesa-${download.table.number}.png`,
          );
        } else {
          const card = stickerOf(
            download.table,
            download.table.printImage ?? download.table.image,
          );
          if (!card) return;
          downloadDataUrl(
            await framedQrPng(card),
            `cicalino-mesa-${card.number}-marco.png`,
          );
        }
      } else {
        const cards = download.tables
          .map((m) =>
            stickerOf(m, kind === "solo" ? m.image : (m.printImage ?? m.image)),
          )
          .filter((c): c is StickerCard => c != null);
        if (!cards.length) {
          toast(t("mesasQr.nadaParaDescargar"), "error");
          return;
        }
        const suffix = kind === "solo" ? "qr" : "marco";
        downloadDataUrl(
          await sheetPng(cards, kind),
          `cicalino-plancha-${suffix}.png`,
        );
      }
      setDownload(null);
    } catch {
      toast(t("mesasQr.errorDescarga"), "error");
    } finally {
      setBusy(false);
    }
  };

  const printSelected = () => {
    if (!tables) return;
    const ids = selected.size
      ? selected
      : new Set(tables.filter((m) => m.qrActive).map((m) => m.id));
    if (!ids.size) {
      toast(t("mesasQr.nadaParaImprimir"), "error");
      return;
    }
    setPrintIds(ids);
    window.setTimeout(() => {
      window.print();
    }, 50);
  };

  if (!ready || !enabled) return null;
  if (!tables) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <MascotLoader className="h-16" />
      </div>
    );
  }

  const activeCount = tables.filter((m) => m.qrActive).length;
  const allActive = tables.length > 0 && activeCount === tables.length;
  const selectedList = tables.filter((m) => selected.has(m.id));
  const selectedActive = selectedList.filter((m) => m.qrActive).length;
  const selectedInactive = selectedList.length - selectedActive;

  return (
    <div className="flex flex-col gap-4">
      <SubPageHeader
        volverA={autoservicio ? "/panel/pedidos" : "/panel/pagos"}
        volverLabel={autoservicio ? t("nav.pedidos") : t("nav.pagos")}
        titulo={t("mesasQr.titulo")}
        sub={autoservicio ? t("retiroQr.sub") : t("mesasQr.sub")}
        acciones={
          <p className="text-sm font-semibold text-carbon">
            {t("mesasQr.resumen", { n: activeCount, total: tables.length })}
          </p>
        }
      />

      {canManage && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 print:hidden">
          {!autoservicio && (
            <>
              <button
                type="button"
                disabled={busy || allActive || !tables.length}
                onClick={() => void apply(true, true)}
                className="min-h-11 text-sm font-semibold text-marca disabled:opacity-40"
              >
                {t("mesasQr.activarTodas")}
              </button>
              <button
                type="button"
                disabled={busy || activeCount === 0}
                onClick={() => void apply(false, true)}
                className="min-h-11 text-sm font-semibold text-carbon/60 disabled:opacity-40"
              >
                {t("mesasQr.quitarTodas")}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={printSelected}
            className="min-h-11 text-sm font-semibold text-carbon/60"
          >
            {t("mesasQr.imprimir")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => openSheet(false)}
            className="min-h-11 text-sm font-semibold text-carbon/60 disabled:opacity-40"
          >
            {t("mesasQr.descargarPlancha")}
          </button>
        </div>
      )}

      {loadError && (
        <EmptyState
          title={t("mesasQr.errorCarga")}
          action={
            <button
              type="button"
              onClick={() => void load()}
              className="min-h-11 rounded-full bg-marca px-5 text-sm font-semibold text-crema"
            >
              {t("mesasQr.reintentar")}
            </button>
          }
        />
      )}

      {!loadError && !tables.length && (
        <EmptyState
          title={t("mesasQr.sinMesas")}
          action={
            <Link href="/panel/config#mesas" className="font-semibold text-marca underline">
              {t("nav.config")}
            </Link>
          }
        />
      )}

      <ul className={`grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${selected.size ? "pb-28 sm:pb-4" : ""}`}>
        {tables.map((m) => {
          const on = m.qrActive;
          const checked = selected.has(m.id);
          return (
            <li
              key={m.id}
              className={`flex flex-col rounded-[20px] border bg-surface p-4 transition ${
                on
                  ? "border-marca/35 ring-1 ring-marca/15"
                  : "border-linea"
              } ${checked ? "ring-2 ring-marca/40" : ""}`}
            >
              <label className="flex cursor-pointer items-start justify-between gap-3">
                <span className="flex min-w-0 flex-col">
                  <span className="font-display text-2xl uppercase text-carbon">
                    {t("mesa.mesaN", { n: m.number })}
                  </span>
                  {!autoservicio && <QrMark on={on} />}
                </span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(m.id)}
                  className="mt-1 size-6 accent-[var(--brand)]"
                  aria-label={t("mesa.mesaN", { n: m.number })}
                />
              </label>
              {on && m.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.image}
                  alt={t("mesasQr.alt", { n: m.number })}
                  className="mt-3 w-full self-center"
                />
              ) : (
                <div className="mt-3 flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-linea bg-crema/40 text-center">
                  <p className="text-sm text-carbon/50">{t("mesasQr.sinQr")}</p>
                </div>
              )}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {on && m.image && (
                  <button
                    type="button"
                    onClick={() => setDownload({ kind: "one", table: m })}
                    className="min-h-11 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/75"
                  >
                    {t("mesasQr.descargar")}
                  </button>
                )}
                {canManage && on && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void regenerate(m)}
                    className="min-h-11 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/60 disabled:opacity-50"
                  >
                    {t("mesasQr.regenerar")}
                  </button>
                )}
                {canManage && !on && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setSelected(new Set([m.id]));
                      void (async () => {
                        setBusy(true);
                        const res = await setTableQrs(branchId!, true, [m.id]);
                        setBusy(false);
                        if (res.ok) {
                          toast(t("mesasQr.activados"), "success");
                          setSelected(new Set());
                          await load();
                        } else {
                          toast(t("mesas.error.error"), "error");
                        }
                      })();
                    }}
                    className="min-h-11 rounded-full bg-marca px-4 text-sm font-semibold text-crema disabled:opacity-50"
                  >
                    {t("mesasQr.activar")}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {canManage && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-14 z-20 border-t border-linea bg-surface/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:bottom-0 print:hidden">
          <p className="text-sm font-semibold text-carbon">{t("mesasQr.seleccionN", { n: selected.size })}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {!autoservicio && selectedInactive > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void apply(true, false)}
                className="min-h-11 rounded-full bg-marca px-4 text-sm font-semibold text-crema disabled:opacity-50"
              >
                {t("mesasQr.activarN", { n: selectedInactive })}
              </button>
            )}
            {!autoservicio && selectedActive > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void apply(false, false)}
                className="min-h-11 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/70 disabled:opacity-50"
              >
                {t("mesasQr.quitarN", { n: selectedActive })}
              </button>
            )}
            <button
              type="button"
              onClick={printSelected}
              className="min-h-11 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/75"
            >
              {t("mesasQr.imprimirSeleccionados")}
            </button>
            {selectedActive > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => openSheet(true)}
                className="min-h-11 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/75 disabled:opacity-50"
              >
                {t("mesasQr.descargarPlanchaSeleccion")}
              </button>
            )}
          </div>
        </div>
      )}

      {download && (download.kind === "one" ? download.table.image : download.tables[0]?.image) ? (
        <QrDownloadModal
          title={
            download.kind === "one"
              ? t("mesa.mesaN", { n: download.table.number })
              : t("mesasQr.planchaN", { n: download.tables.length })
          }
          previewSrc={
            download.kind === "one"
              ? download.table.image!
              : download.tables[0]!.image!
          }
          venue={branchName.trim() || "Cicalino"}
          tableLabel={
            download.kind === "one"
              ? t("mesa.mesaN", { n: download.table.number })
              : t("mesa.mesaN", { n: download.tables[0]!.number })
          }
          busy={busy}
          flow={flow}
          onPick={(kind) => void runDownload(kind)}
          onClose={() => {
            if (!busy) setDownload(null);
          }}
        />
      ) : null}

      {onClient && tables.some((m) => m.printImage)
        ? createPortal(
            <div data-imprimible="qr" aria-hidden className="hidden print:block">
              {tables.map((m) => {
                if (!m.printImage) return null;
                if (printIds != null && !printIds.has(m.id)) return null;
                return (
                  <article
                    key={m.id}
                    className="mx-auto break-inside-avoid"
                    style={{
                      width: `${INFORMATIVE_QR_MM.w}mm`,
                      height: `${INFORMATIVE_QR_MM.h}mm`,
                      marginBottom: "10mm",
                    }}
                  >
                    <InformativeQrCard
                      qrSrc={m.printImage}
                      venue={branchName.trim() || "Cicalino"}
                      tableLabel={t("mesa.mesaN", { n: m.number })}
                      accent={accent}
                      flow={flow}
                    />
                  </article>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};
