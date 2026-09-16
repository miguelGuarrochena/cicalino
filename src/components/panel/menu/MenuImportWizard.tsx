"use client";

import { useState } from "react";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { Select } from "@/components/ui/Select";
import { useApp } from "@/components/providers/Providers";
import { XlsxError, looksLikeLegacyXls, looksLikeZip, readXlsx } from "@/lib/xlsx";
import {
  applyMapping,
  draftFromTable,
  parseDelimited,
  type MenuImportColumn,
  type MenuImportDraft,
  type MenuImportRow,
} from "@/lib/menuImport";
import { formatMoney } from "@/lib/tableBill";

type Step = "file" | "map" | "preview";

const COLS: { id: MenuImportColumn; key: string }[] = [
  { id: "skip", key: "carta.colIgnorar" },
  { id: "category", key: "carta.colCategoria" },
  { id: "name", key: "carta.colProducto" },
  { id: "description", key: "carta.colDescripcion" },
  { id: "price", key: "carta.colPrecio" },
  { id: "cost", key: "carta.colCosto" },
];

export const MenuImportWizard = ({
  busy,
  onClose,
  onImport,
}: {
  busy: boolean;
  onClose: () => void;
  onImport: (rows: MenuImportRow[]) => Promise<void>;
}) => {
  const { t } = useApp();
  const [step, setStep] = useState<Step>("file");
  const [draft, setDraft] = useState<MenuImportDraft | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const mapped = draft ? applyMapping(draft) : [];
  const valid = mapped.filter((r) => !r.error);
  const bad = mapped.filter((r) => r.error);

  const [reading, setReading] = useState(false);

  /* .xlsx is read in the browser (lib/xlsx); CSV/TSV as text. Nothing is
   * uploaded until the owner confirms the preview. */
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    setReading(true);
    let table: string[][];
    try {
      const buffer = await file.arrayBuffer();
      const head = new Uint8Array(buffer.slice(0, 8));
      if (looksLikeLegacyXls(head)) {
        setFileError(t("carta.importarXlsViejo"));
        return;
      }
      table = looksLikeZip(head)
        ? await readXlsx(buffer)
        : parseDelimited(new TextDecoder().decode(buffer));
    } catch (e) {
      setFileError(e instanceof XlsxError ? t("carta.importarXlsxRoto") : t("carta.error"));
      return;
    } finally {
      setReading(false);
    }
    const next = draftFromTable(table);
    if (!next) {
      setFileError(t("carta.error"));
      return;
    }
    setDraft(next);
    setStep("map");
  };

  return (
    <ModalShell
      wide
      labelledBy="carta-importar"
      busy={busy}
      onClose={onClose}
      footer={
        step === "file" ? undefined : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(step === "preview" ? "map" : "file")}
              className="min-h-11 flex-1 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/70"
            >
              {t("carta.cancelar")}
            </button>
            {step === "map" ? (
              <button
                type="button"
                onClick={() => setStep("preview")}
                disabled={!draft?.mapping.includes("name") || !draft.mapping.includes("price")}
                className="min-h-11 flex-1 rounded-full bg-marca px-4 text-sm font-semibold text-crema disabled:opacity-50"
              >
                {t("carta.importarPreview")}
              </button>
            ) : (
              <button
                type="button"
                disabled={!valid.length || busy}
                onClick={() => void onImport(valid)}
                className="min-h-11 flex-1 rounded-full bg-marca px-4 text-sm font-semibold text-crema disabled:opacity-50"
              >
                {t("carta.importarConfirmar", { n: valid.length })}
              </button>
            )}
          </div>
        )
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="carta-importar" className="font-display text-2xl uppercase tracking-tight text-carbon">
            {t("carta.importarTitulo")}
          </h2>
          <p className="mt-1 text-sm text-carbon/55">{t("carta.importarSub")}</p>
          <ol className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
            {(["file", "map", "preview"] as const).map((id, i) => (
              <li
                key={id}
                aria-current={step === id ? "step" : undefined}
                className={`rounded-full px-2.5 py-1 ${
                  step === id ? "bg-marca text-crema" : "bg-carbon/5 text-carbon/50"
                }`}
              >
                {i + 1}. {t(`carta.importarPaso.${id}`)}
              </li>
            ))}
          </ol>
        </div>
        <ModalCloseBtn onClick={onClose} label={t("carta.cancelar")} />
      </div>

      {step === "file" && (
        <div className="mt-5">
          <p className="text-sm text-carbon/60">{t("carta.importarHint")}</p>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-linea">
            <table className="w-full text-left text-xs">
              <thead className="bg-crema/60 text-carbon/60">
                <tr>
                  {["colCategoria", "colProducto", "colDescripcion", "colPrecio", "colCosto"].map((k) => (
                    <th key={k} className="px-3 py-2 font-semibold">{t(`carta.${k}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-carbon/75">
                <tr>
                  <td className="px-3 py-2">{t("carta.sugerida.pizzas")}</td>
                  <td className="px-3 py-2">Margherita</td>
                  <td className="px-3 py-2">{t("carta.importarEjemploDesc")}</td>
                  <td className="px-3 py-2 tabular-nums">12000</td>
                  <td className="px-3 py-2 tabular-nums">4500</td>
                </tr>
              </tbody>
            </table>
          </div>
          <label
            className={`mt-4 flex min-h-12 cursor-pointer items-center justify-center rounded-full bg-marca px-5 text-sm font-semibold text-crema ${
              reading ? "opacity-60" : ""
            }`}
          >
            {reading ? "…" : t("carta.importarArchivo")}
            <input
              type="file"
              accept=".xlsx,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={reading}
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
          {fileError && <p className="mt-3 text-xs text-red-600">{fileError}</p>}
        </div>
      )}

      {step === "map" && draft && (
        <ul className="mt-4 flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-carbon/50">
            {t("carta.importarColumnas")}
          </p>
          {draft.headers.map((h, i) => (
            <li key={`${h}-${i}`} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-semibold text-carbon">{h || `Col ${i + 1}`}</span>
              <Select
                value={draft.mapping[i] ?? "skip"}
                onChange={(value) => {
                  const mapping = [...draft.mapping] as MenuImportColumn[];
                  mapping[i] = value as MenuImportColumn;
                  setDraft({ ...draft, mapping });
                }}
                options={COLS.map((c) => ({ value: c.id, label: t(c.key) }))}
                ariaLabel={h}
              />
            </li>
          ))}
        </ul>
      )}

      {step === "preview" && (
        <div className="mt-4">
          {bad.length > 0 && (
            <p className="mb-3 text-xs text-red-600">
              {t("carta.importarErrores", { n: bad.length })}
            </p>
          )}
          <ul className="flex max-h-72 flex-col divide-y divide-linea/70 overflow-y-auto rounded-2xl border border-linea">
            {mapped.slice(0, 40).map((r, i) => (
              <li key={`${r.name}-${i}`} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-semibold text-carbon">
                  {r.name || "—"}
                  {r.category ? (
                    <span className="ml-2 text-xs font-normal text-carbon/50">{r.category}</span>
                  ) : null}
                </span>
                <span className="tabular-nums text-carbon/70">
                  {r.price != null ? formatMoney(r.price) : "—"}
                </span>
                {r.error && <span className="w-full text-xs text-red-600">{r.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </ModalShell>
  );
};
