"use client";

import { useApp } from "@/components/providers/Providers";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { AvailabilitySwitch } from "@/components/panel/menu/RowMenu";

export type CategoryDraft = { id?: string; name: string; active: boolean };

const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-3 py-3 text-base text-carbon outline-none focus:border-marca focus:ring-2 focus:ring-marca/20";

export const CategoryDialog = ({
  draft,
  setDraft,
  productCount,
  busy,
  error,
  onClose,
  onSave,
  onDelete,
}: {
  draft: CategoryDraft;
  setDraft: (next: CategoryDraft) => void;
  productCount: number;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
}) => {
  const { t } = useApp();
  const editing = Boolean(draft.id);

  return (
    <ModalShell
      labelledBy="menu-categoria"
      busy={busy}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {editing && onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="min-h-11 rounded-full border border-red-300 px-4 text-sm font-semibold text-red-600 disabled:opacity-50"
            >
              {t("carta.borrar")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onSave}
            disabled={busy || !draft.name.trim()}
            className="min-h-11 flex-1 rounded-full bg-marca px-4 text-sm font-semibold text-crema disabled:opacity-50"
          >
            {editing ? t("carta.guardar") : t("carta.crearCategoriaCta")}
          </button>
        </div>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="menu-categoria" className="font-display text-2xl uppercase tracking-tight text-carbon">
          {editing ? t("carta.editarCategoria") : t("carta.nuevaCategoria")}
        </h2>
        <ModalCloseBtn onClick={onClose} disabled={busy} label={t("carta.cancelar")} />
      </div>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-carbon/55">{t("carta.categoriaNombre")}</span>
          <input
            className={INPUT}
            autoFocus
            maxLength={40}
            value={draft.name}
            placeholder={t("carta.categoriaPh")}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <div className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-linea px-3">
          <span className="text-sm font-semibold text-carbon">{t("carta.categoriaVisible")}</span>
          <AvailabilitySwitch
            checked={draft.active}
            onChange={(active) => setDraft({ ...draft, active })}
            labelOn={t("carta.visible")}
            labelOff={t("carta.oculta")}
          />
        </div>
        {!draft.active && <p className="text-xs text-carbon/55">{t("carta.categoriaOcultaAyuda")}</p>}
        {editing && productCount > 0 && (
          <p className="text-xs text-carbon/55">{t("carta.categoriaRenombrarAyuda", { n: productCount })}</p>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    </ModalShell>
  );
};
