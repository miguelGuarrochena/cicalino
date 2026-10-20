"use client";

import { useMemo, useState } from "react";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { Select } from "@/components/ui/Select";
import { useApp } from "@/components/providers/Providers";
import { compressMenuImage, type MenuCategoryView, type MenuProductView } from "@/lib/data/menu";
import { choiceDraftValida, type ChoiceDraft } from "@/lib/dishChoice";
import { AvailabilitySwitch } from "@/components/panel/menu/RowMenu";
import { formatMoney } from "@/lib/tableBill";

const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-3 py-2.5 text-sm text-carbon outline-none focus:border-marca focus:ring-2 focus:ring-marca/20";

export type ProductDraft = {
  name: string;
  description: string;
  category: string;
  price: string;
  cost: string;
  imageUrl: string;
  active: boolean;
  choice: ChoiceDraft | null;
};

export const emptyProductDraft = (category: string): ProductDraft => ({
  name: "",
  description: "",
  category,
  price: "",
  cost: "",
  imageUrl: "",
  active: true,
  choice: null,
});

export const draftFromProduct = (p: MenuProductView): ProductDraft => ({
  name: p.name,
  description: p.description ?? "",
  category: p.category ?? "",
  price: String(p.price),
  cost: p.cost != null ? String(p.cost) : "",
  imageUrl: p.imageUrl ?? "",
  active: p.active,
  choice: p.choice
    ? {
        question: p.choice.question,
        options: p.choice.options.map((o) => ({ name: o.name, price: String(o.price) })),
      }
    : null,
});

export const MenuProductDrawer = ({
  draft,
  setDraft,
  categories,
  editing,
  busy,
  error,
  onClose,
  onSave,
  onDelete,
}: {
  draft: ProductDraft;
  setDraft: (next: ProductDraft) => void;
  categories: MenuCategoryView[];
  editing: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
  /* Only when editing an existing product. */
  onDelete?: () => void;
}) => {
  const { t } = useApp();
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const options = useMemo(
    () => [
      { value: "", label: t("carta.sinCategoria") },
      ...[...categories]
        .sort((a, b) => a.order - b.order)
        .map((c) => ({ value: c.name, label: c.name })),
    ],
    [categories, t],
  );

  const optionPrices = (draft.choice?.options ?? [])
    .map((o) => Number(o.price.replace(/\D/g, "")))
    .filter((n) => n > 0);
  const price = draft.choice
    ? optionPrices.length ? Math.min(...optionPrices) : 0
    : Number(draft.price) || 0;
  const puedeGuardar =
    draft.name.trim().length > 0 && choiceDraftValida(draft.choice) && price > 0;
  const cost = draft.cost ? Number(draft.cost) : null;
  const margin = cost != null && price > 0 ? Math.round(((price - cost) / price) * 100) : null;

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setImageBusy(true);
    setImageError(null);
    try {
      const url = await compressMenuImage(file);
      setDraft({ ...draft, imageUrl: url });
    } catch {
      setImageError(t("carta.imagenInvalida"));
    } finally {
      setImageBusy(false);
    }
  };

  return (
    <ModalShell
      labelledBy="carta-producto"
      busy={busy || imageBusy}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap gap-2">
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="min-h-11 rounded-full border border-red-300 px-4 text-sm font-semibold text-red-600 disabled:opacity-50"
            >
              {t("carta.eliminarCorto")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/70"
          >
            {t("carta.cancelar")}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy || !puedeGuardar}
            className="min-h-11 min-w-[8rem] flex-1 rounded-full bg-marca px-4 text-sm font-semibold text-crema disabled:opacity-50"
          >
            {editing ? t("carta.guardar") : t("carta.crearProducto")}
          </button>
        </div>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="carta-producto" className="font-display text-2xl uppercase tracking-tight text-carbon">
          {editing ? t("carta.editarProducto") : t("carta.nuevoProducto")}
        </h2>
        <ModalCloseBtn onClick={onClose} label={t("carta.cancelar")} />
      </div>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-carbon/55">{t("carta.nombre")}</span>
          <input
            className={INPUT}
            autoFocus
            maxLength={80}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-carbon/55">{t("carta.categoria")}</span>
          <Select
            value={draft.category}
            onChange={(value) => setDraft({ ...draft, category: value })}
            options={options}
            ariaLabel={t("carta.categoria")}
          />
        </label>
        <div className={`grid gap-2 ${draft.choice ? "grid-cols-1" : "grid-cols-2"}`}>
          {!draft.choice && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-carbon/55">{t("carta.precio")}</span>
            <input
              className={INPUT}
              inputMode="numeric"
              value={draft.price}
              onChange={(e) =>
                setDraft({ ...draft, price: e.target.value.replace(/\D/g, "") })
              }
            />
          </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-carbon/55">{t("carta.costo")}</span>
            <input
              className={INPUT}
              inputMode="numeric"
              value={draft.cost}
              onChange={(e) =>
                setDraft({ ...draft, cost: e.target.value.replace(/\D/g, "") })
              }
              placeholder={t("carta.costoPh")}
            />
          </label>
        </div>
        {margin != null && (
          <p className={`-mt-1 text-xs ${margin < 0 ? "text-red-600" : "text-carbon/55"}`}>
            {t("carta.margen", { n: margin, monto: formatMoney(price - (cost ?? 0)) })}
          </p>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-carbon/55">{t("carta.descripcion")}</span>
          <textarea
            className={`${INPUT} min-h-20 resize-y`}
            maxLength={200}
            rows={2}
            value={draft.description}
            placeholder={t("carta.descripcionPh")}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </label>
        <div className="rounded-2xl border border-linea bg-crema/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-carbon">{t("carta.opciones")}</p>
            {draft.choice ? (
              <button
                type="button"
                onClick={() => setDraft({ ...draft, choice: null })}
                className="text-xs font-semibold text-carbon/60 underline"
              >
                {t("carta.sacarOpciones")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    choice: {
                      question: "",
                      options: [
                        { name: "", price: draft.price },
                        { name: "", price: draft.price },
                      ],
                    },
                  })
                }
                className="text-xs font-semibold text-marca underline"
              >
                {t("carta.ponerOpciones")}
              </button>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-carbon/55">{t("carta.opcionesAyuda")}</p>
          {draft.choice && (
            <div className="mt-3 flex flex-col gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-carbon/55">{t("carta.opcionesPregunta")}</span>
                <input
                  className={INPUT}
                  maxLength={24}
                  value={draft.choice.question}
                  placeholder={t("carta.opcionesPreguntaPh")}
                  onChange={(e) =>
                    setDraft({ ...draft, choice: { ...draft.choice!, question: e.target.value } })
                  }
                />
              </label>
              {draft.choice.options.map((o, i) => (
                <div key={i} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
                  <input
                    className={INPUT}
                    maxLength={24}
                    value={o.name}
                    placeholder={t("carta.opcionNombrePh")}
                    aria-label={t("carta.opcionNombrePh")}
                    onChange={(e) => {
                      const options = draft.choice!.options.map((row, n) =>
                        n === i ? { ...row, name: e.target.value } : row,
                      );
                      setDraft({ ...draft, choice: { ...draft.choice!, options } });
                    }}
                  />
                  <input
                    className={INPUT}
                    inputMode="numeric"
                    value={o.price}
                    aria-label={t("carta.precio")}
                    onChange={(e) => {
                      const options = draft.choice!.options.map((row, n) =>
                        n === i ? { ...row, price: e.target.value.replace(/\D/g, "") } : row,
                      );
                      setDraft({ ...draft, choice: { ...draft.choice!, options } });
                    }}
                  />
                  {draft.choice!.options.length > 2 ? (
                    <button
                      type="button"
                      onClick={() => {
                        const options = draft.choice!.options.filter((_, n) => n !== i);
                        setDraft({ ...draft, choice: { ...draft.choice!, options } });
                      }}
                      className="text-xs font-semibold text-carbon/55 underline"
                    >
                      {t("carta.quitarOpcion")}
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
              {draft.choice.options.length < 3 && (
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      choice: {
                        ...draft.choice!,
                        options: [...draft.choice!.options, { name: "", price: draft.price }],
                      },
                    })
                  }
                  className="min-h-10 rounded-full border border-linea text-sm font-semibold text-carbon/70"
                >
                  {t("carta.agregarOpcion")}
                </button>
              )}
              {(draft.choice.question.trim() || draft.choice.options.some((o) => o.name.trim())) &&
                !choiceDraftValida(draft.choice) && (
                <p className="text-xs text-red-600">{t("carta.opcionesInvalidas")}</p>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-carbon/55">{t("carta.imagen")}</span>
          {draft.imageUrl ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={draft.imageUrl} alt="" className="size-16 rounded-xl object-cover" />
              <button
                type="button"
                onClick={() => setDraft({ ...draft, imageUrl: "" })}
                className="text-xs font-semibold text-carbon/60 underline"
              >
                {t("carta.imagenSacar")}
              </button>
            </div>
          ) : null}
          <input
            className={INPUT}
            value={draft.imageUrl.startsWith("data:") ? "" : draft.imageUrl}
            placeholder={t("carta.imagenUrl")}
            onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}
          />
          <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-full border border-linea px-4 text-sm font-semibold text-carbon/70">
            {t("carta.imagenArchivo")}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => void pickFile(e.target.files?.[0])}
            />
          </label>
        </div>
        <div className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-linea px-3">
          <span className="text-sm font-semibold text-carbon">{t("carta.disponibilidad")}</span>
          <AvailabilitySwitch
            checked={draft.active}
            onChange={(active) => setDraft({ ...draft, active })}
            labelOn={t("carta.disponible")}
            labelOff={t("carta.noDisponible")}
          />
        </div>
        {imageError && <p className="text-xs text-red-600">{imageError}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    </ModalShell>
  );
};
