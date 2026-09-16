"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { useApp } from "@/components/providers/Providers";
import { useSessionStore } from "@/lib/store/session-store";
import { useConfigStore } from "@/lib/store/config-store";
import { useToast } from "@/components/ui/Toast";
import { MascotLoader } from "@/components/ui/MascotLoader";
import { fetchTableQrs, regenerateTableQr, type TableQrView } from "@/lib/data/tables";

type WithImage = TableQrView & { url: string; image: string };

/* Printable QR per table. The QR holds an opaque token that the server maps
 * to (restaurant, table); regenerating it retires printed copies. Physical
 * stickers are made outside Cicalino from the PNG downloaded here. */
const MesasQrPage = () => {
  const { t } = useApp();
  const toast = useToast();
  const branchId = useSessionStore((s) => s.sucursalId);
  const branchName = useConfigStore((s) => s.name);
  const moduloPagos = useConfigStore((s) => s.moduloPagos);
  const role = useSessionStore((s) => s.rol);
  const [tables, setTables] = useState<WithImage[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
        const image = await QRCode.toDataURL(url, {
          margin: 2,
          width: 600,
          errorCorrectionLevel: "H",
          color: { dark: "#1b29b0", light: "#ffffff" },
        });
        return { ...m, url, image };
      }),
    );
    setTables(withImages);
  }, [branchId]);

  useEffect(() => {
    if (moduloPagos) void load();
  }, [load, moduloPagos]);

  const regenerate = async (m: WithImage) => {
    if (!window.confirm(t("mesasQr.regenerarConfirmar", { n: m.number }))) return;
    setBusy(m.id);
    const res = await regenerateTableQr(m.id);
    setBusy(null);
    if (res.ok) {
      toast(t("mesasQr.regenerado", { n: m.number }), "success");
      await load();
    } else {
      toast(t("mesas.error.error"), "error");
    }
  };

  const download = (m: WithImage) => {
    const a = document.createElement("a");
    a.href = m.image;
    a.download = `cicalino-mesa-${m.number}.png`;
    a.click();
  };

  if (!moduloPagos) {
    return <p className="text-sm text-carbon/60">{t("mesas.sinModulo")}</p>;
  }
  if (!tables) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <MascotLoader className="h-16" />
      </div>
    );
  }

  const canRegenerate = role === "admin" || role === "supervisor";

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
        </div>
        {tables.length > 0 && (
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-11 rounded-full bg-marca px-5 text-sm font-semibold text-crema"
          >
            {t("mesasQr.imprimir")}
          </button>
        )}
      </header>

      {!tables.length && (
        <p className="rounded-2xl border border-dashed border-linea p-6 text-center text-sm text-carbon/60 print:hidden">
          {t("mesasQr.sinMesas")}{" "}
          <Link href="/panel/config" className="font-semibold text-marca underline">
            {t("nav.config")}
          </Link>
        </p>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-2 print:gap-6">
        {tables.map((m) => (
          <li
            key={m.id}
            className="flex break-inside-avoid flex-col items-center rounded-[20px] border border-linea bg-white p-4 text-center print:rounded-none print:border-2 print:border-dashed print:border-gray-400"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
              {branchName}
            </p>
            <p className="font-display text-3xl uppercase text-[#1b29b0]">
              {t("mesa.mesaN", { n: m.number })}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.image} alt={t("mesasQr.alt", { n: m.number })} className="mt-2 w-full max-w-[220px]" />
            <p className="mt-2 text-xs font-medium text-gray-600">{t("mesasQr.instruccion")}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 print:hidden">
              <button
                type="button"
                onClick={() => download(m)}
                className="min-h-9 rounded-full border border-linea px-3 text-xs font-semibold text-carbon/75"
              >
                {t("mesasQr.descargar")}
              </button>
              {canRegenerate && (
                <button
                  type="button"
                  disabled={busy === m.id}
                  onClick={() => void regenerate(m)}
                  className="min-h-9 rounded-full border border-linea px-3 text-xs font-semibold text-carbon/60 disabled:opacity-50"
                >
                  {t("mesasQr.regenerar")}
                </button>
              )}
            </div>
            {m.generatedAt && (
              <p className="mt-1 text-[10px] text-carbon/45 print:hidden">
                {t("mesasQr.generado", { f: new Date(m.generatedAt).toLocaleDateString() })}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default MesasQrPage;
