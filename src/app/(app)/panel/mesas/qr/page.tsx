"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { useApp } from "@/components/providers/Providers";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import { useSessionStore } from "@/lib/store/session-store";
import { useConfigStore } from "@/lib/store/config-store";
import { useToast } from "@/components/ui/Toast";
import { MascotLoader } from "@/components/ui/MascotLoader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  fetchTableQrs,
  regenerateTableQr,
  setTableQrs,
  type TableQrView,
} from "@/lib/data/tables";

type WithImage = TableQrView & { url: string; image: string | null };

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

const MesasQrPage = () => {
  const { t } = useApp();
  const toast = useToast();
  const branchId = useSessionStore((s) => s.sucursalId);
  const branchName = useConfigStore((s) => s.name);
  const { visibles, canManage, ready } = useOperationalAccess();
  const [tables, setTables] = useState<WithImage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printIds, setPrintIds] = useState<Set<string> | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    const res = await fetchTableQrs(branchId);
    if (!res.ok) {
      setTables([]);
      return;
    }
    const origin = window.location.origin;
    const withImages = await Promise.all(
      res.data.map(async (m) => {
        const url = `${origin}/m/${m.qrToken}`;
        const image = m.qrActive
          ? await QRCode.toDataURL(url, {
              margin: 2,
              width: 600,
              errorCorrectionLevel: "H",
              color: { dark: "#1b29b0", light: "#ffffff" },
            })
          : null;
        return { ...m, url, image };
      }),
    );
    setTables(withImages);
  }, [branchId]);

  useEffect(() => {
    if (visibles.pagos) void load();
  }, [load, visibles.pagos]);

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
    if (!window.confirm(t("mesasQr.regenerarConfirmar", { n: m.number }))) return;
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

  const download = (m: WithImage) => {
    if (!m.image) return;
    const a = document.createElement("a");
    a.href = m.image;
    a.download = `cicalino-mesa-${m.number}.png`;
    a.click();
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
      setPrintIds(null);
    }, 50);
  };

  if (!ready || !visibles.pagos) return null;
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
      <header className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <Link href="/panel/mesas" className="text-sm text-carbon/60 hover:underline">
            ← {t("mesas.titulo")}
          </Link>
          <h1 className="font-display text-3xl uppercase tracking-tight text-carbon">
            {t("mesasQr.titulo")}
          </h1>
          <p className="max-w-xl text-sm text-carbon/60">{t("mesasQr.sub")}</p>
          <p className="mt-1 text-sm font-semibold text-carbon">
            {t("mesasQr.resumen", { n: activeCount, total: tables.length })}
          </p>
        </div>
      </header>

      {canManage && (
        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            disabled={busy || allActive}
            onClick={() => void apply(true, true)}
            className="min-h-11 rounded-full bg-marca px-4 text-sm font-semibold text-crema disabled:opacity-50"
          >
            {t("mesasQr.activarTodas")}
          </button>
          <button
            type="button"
            disabled={busy || activeCount === 0}
            onClick={() => void apply(false, true)}
            className="min-h-11 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/75 disabled:opacity-50"
          >
            {t("mesasQr.quitarTodas")}
          </button>
          {selected.size > 0 && (
            <>
              {selectedInactive > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void apply(true, false)}
                  className="min-h-11 rounded-full border border-marca/40 px-4 text-sm font-semibold text-marca disabled:opacity-50"
                >
                  {t("mesasQr.activarN", { n: selectedInactive })}
                </button>
              )}
              {selectedActive > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void apply(false, false)}
                  className="min-h-11 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/70 disabled:opacity-50"
                >
                  {t("mesasQr.quitarN", { n: selectedActive })}
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={printSelected}
            className="min-h-11 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/75"
          >
            {selected.size ? t("mesasQr.imprimirSeleccionados") : t("mesasQr.imprimir")}
          </button>
        </div>
      )}

      {!tables.length && (
        <EmptyState
          title={t("mesasQr.sinMesas")}
          action={
            <Link href="/panel/config#mesas" className="font-semibold text-marca underline">
              {t("nav.config")}
            </Link>
          }
        />
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-2 print:gap-6">
        {tables.map((m) => {
          const on = m.qrActive;
          const checked = selected.has(m.id);
          const hidePrint = printIds != null && !printIds.has(m.id);
          return (
            <li
              key={m.id}
              className={`flex break-inside-avoid flex-col rounded-[20px] border bg-surface p-3 transition print:items-center print:rounded-none print:border-2 print:border-dashed print:border-gray-400 print:bg-white print:p-4 print:text-center ${
                hidePrint ? "print:hidden" : ""
              } ${
                on
                  ? "border-marca/35 ring-1 ring-marca/15"
                  : "border-linea"
              } ${checked ? "ring-2 ring-marca/40" : ""}`}
            >
              <label className="flex cursor-pointer items-start justify-between gap-2 print:hidden">
                <span className="flex min-w-0 flex-col">
                  <span className="font-display text-2xl uppercase text-carbon">
                    {t("mesa.mesaN", { n: m.number })}
                  </span>
                  <QrMark on={on} />
                </span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(m.id)}
                  className="mt-1 size-5 accent-[var(--brand)]"
                  aria-label={t("mesa.mesaN", { n: m.number })}
                />
              </label>
              <p className="hidden text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500 print:block">
                {branchName}
              </p>
              <p className="hidden font-display text-3xl uppercase text-[#1b29b0] print:block">
                {t("mesa.mesaN", { n: m.number })}
              </p>
              {on && m.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.image}
                  alt={t("mesasQr.alt", { n: m.number })}
                  className="mt-2 w-full max-w-[220px] self-center"
                />
              ) : (
                <div className="mt-3 flex min-h-24 flex-col items-center justify-center rounded-2xl border border-dashed border-linea bg-crema/40 text-center print:hidden">
                  <p className="text-xs text-carbon/50">{t("mesasQr.sinQr")}</p>
                </div>
              )}
              {on && (
                <p className="mt-2 hidden text-xs font-medium text-gray-600 print:block">
                  {t("mesasQr.instruccion")}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2 print:hidden">
                {on && (
                  <button
                    type="button"
                    onClick={() => download(m)}
                    className="min-h-9 rounded-full border border-linea px-3 text-xs font-semibold text-carbon/75"
                  >
                    {t("mesasQr.descargar")}
                  </button>
                )}
                {canManage && on && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void regenerate(m)}
                    className="min-h-9 rounded-full border border-linea px-3 text-xs font-semibold text-carbon/60 disabled:opacity-50"
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
                    className="min-h-9 rounded-full bg-marca px-3 text-xs font-semibold text-crema disabled:opacity-50"
                  >
                    {t("mesasQr.activar")}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default MesasQrPage;
