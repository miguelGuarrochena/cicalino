"use client";

import { useMemo } from "react";
import { useApp } from "@/components/providers/Providers";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { formatMoney } from "@/lib/tableBill";
import { guestMenuGroups } from "@/lib/menuView";
import type { MenuCategoryView, MenuProductView } from "@/lib/data/menu";

/* "Ver menú": the menu the way a guest sees it after scanning a table QR.
 * Built from the same rules as the guest screen (lib/menuView): hidden
 * categories and unavailable products left out, category and product order
 * respected. No cost, no availability switches, no admin controls. */
export const MenuPreviewDialog = ({
  branchName,
  categories,
  products,
  onClose,
}: {
  branchName: string;
  categories: MenuCategoryView[];
  products: MenuProductView[];
  onClose: () => void;
}) => {
  const { t } = useApp();
  const groups = useMemo(
    () => guestMenuGroups(categories, products, t("carta.sinCategoria")),
    [categories, products, t],
  );

  return (
    <ModalShell wide labelledBy="menu-preview-title" onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-carbon/45">
            {t("carta.previewKicker")}
          </p>
          <h2 id="menu-preview-title" className="font-display text-2xl uppercase tracking-tight text-marca">
            {branchName || t("carta.titulo")}
          </h2>
        </div>
        <ModalCloseBtn onClick={onClose} label={t("carta.cancelar")} />
      </div>

      {/* Same frame width as a phone so line breaks match what guests see. */}
      <div className="mx-auto mt-4 w-full max-w-sm overflow-hidden rounded-[28px] border border-linea bg-crema">
        {groups.length > 1 && (
          <nav
            aria-label={t("carta.categorias")}
            className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-linea bg-crema/95 px-3 py-2"
          >
            {groups.map((g) => (
              <a
                key={g.key}
                href={`#preview-${g.key}`}
                className="shrink-0 rounded-full border border-linea bg-surface px-3 py-1.5 text-xs font-semibold text-carbon/75"
              >
                {g.name}
              </a>
            ))}
          </nav>
        )}
        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-3 py-4">
          {!groups.length && (
            <p className="py-10 text-center text-sm text-carbon/55">{t("carta.previewVacia")}</p>
          )}
          {groups.map((g) => (
            <section key={g.key} id={`preview-${g.key}`} className="scroll-mt-14">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-carbon/50">{g.name}</h3>
              <ul className="flex flex-col gap-2">
                {g.items.map((p) => (
                  <li key={p.id} className="flex gap-3 rounded-2xl border border-linea bg-surface p-3">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-carbon">{p.name}</p>
                      {p.description && <p className="mt-0.5 text-xs text-carbon/55">{p.description}</p>}
                      <p className="mt-1 text-sm font-semibold tabular-nums text-marca">{formatMoney(p.price)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-carbon/50">{t("carta.previewNota")}</p>
    </ModalShell>
  );
};
