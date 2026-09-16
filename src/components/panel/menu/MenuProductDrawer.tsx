"use client";

import { useMemo, useState } from "react";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { Select } from "@/components/ui/Select";
import { useApp } from "@/components/providers/Providers";
import { compressMenuImage, type MenuCategoryView, type MenuProductView } from "@/lib/data/menu";

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
};

export const emptyProductDraft = (category: string): ProductDraft => ({
  name: "",
  description: "",
  category,
  price: "",
  cost: "",
  imageUrl: "",
  active: true,
});

export const draftFromProduct = (p: MenuProductView): ProductDraft => ({
  name: p.name,
  description: p.description ?? "",
  category: p.category ?? "",
  price: String(p.price),
  cost: p.cost != null ? String(p.cost) : "",
  imageUrl: p.imageUrl ?? "",
  active: p.active,
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
}: {
  draft: ProductDraft;
  setDraft: (next: ProductDraft) => void;
  categories: MenuCategoryView[];
  editing: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
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
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/70"
          >
            {t("carta.cancelar")}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy || !draft.name.trim() || !draft.price}
            className="min-h-11 flex-1 rounded-full bg-marca px-4 text-sm font-semibold text-crema disabled:opacity-50"
          >
            {editing ? t("carta.guardar") : t("carta.crearProducto")}
          </button>
        </div>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="carta-producto" className="font-display text-2xl uppercase tracking-tight text-carbon">
          {editing ? t("carta.editar") : t("carta.crearProducto")}
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
        <div className="grid grid-cols-2 gap-2">
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
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-carbon/55">{t("carta.costo")}</span>
            <input
              className={INPUT}
              inputMode="numeric"
              value={draft.cost}
              onChange={(e) =>
                setDraft({ ...draft, cost: e.target.value.replace(/\D/g, "") })
              }
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-carbon/55">{t("carta.descripcion")}</span>
          <input
            className={INPUT}
            maxLength={200}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </label>
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
        <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-linea px-3">
          <span className="text-sm font-semibold text-carbon">{t("carta.disponibilidad")}</span>
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
          />
        </label>
        {imageError && <p className="text-xs text-red-600">{imageError}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    </ModalShell>
  );
};
