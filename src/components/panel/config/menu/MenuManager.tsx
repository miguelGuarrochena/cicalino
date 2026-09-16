"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useToast } from "@/components/ui/Toast";
import { useSessionStore } from "@/lib/store/session-store";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import { isRealBranchId } from "@/lib/data/orders";
import { NoAccess } from "@/components/ui/NoAccess";
import { EmptyState } from "@/components/ui/EmptyState";
import { MascotLoader } from "@/components/ui/MascotLoader";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { formatMoney } from "@/lib/tableBill";
import { DEFAULT_MENU_CATEGORY_KEYS } from "@/lib/menuImport";
import type { MenuImportRow } from "@/lib/menuImport";
import {
  deleteMenuCategory,
  deleteMenuProduct,
  fetchMenuCategories,
  fetchMenuProducts,
  importMenuRows,
  reorderMenuCategories,
  reorderMenuProducts,
  saveMenuCategory,
  saveMenuProduct,
  syncMissingCategories,
  type MenuCategoryView,
  type MenuProductView,
} from "@/lib/data/menu";
import { MenuPreview } from "@/components/panel/config/menu/MenuPreview";
import {
  MenuProductDrawer,
  draftFromProduct,
  emptyProductDraft,
  type ProductDraft,
} from "@/components/panel/config/menu/MenuProductDrawer";
import { MenuImportWizard } from "@/components/panel/config/menu/MenuImportWizard";

const UNCAT = "__uncat__";
const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-3 py-2.5 text-sm text-carbon outline-none focus:border-marca focus:ring-2 focus:ring-marca/20";

type MobilePane = "categorias" | "productos" | "preview";

const sameCat = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

const payloadFromDraft = (d: ProductDraft, order: number) => ({
  name: d.name,
  description: d.description,
  category: d.category,
  price: Number(d.price.replace(/\D/g, "")),
  cost: d.cost ? Number(d.cost.replace(/\D/g, "")) : null,
  imageUrl: d.imageUrl || undefined,
  active: d.active,
  order,
});

export const MenuManager = () => {
  const { t } = useApp();
  const toast = useToast();
  const branchId = useSessionStore((s) => s.sucursalId);
  const { visibles } = useOperationalAccess();
  const [categories, setCategories] = useState<MenuCategoryView[] | null>(null);
  const [products, setProducts] = useState<MenuProductView[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pane, setPane] = useState<MobilePane>("categorias");
  const [query, setQuery] = useState("");
  const [productDraft, setProductDraft] = useState<ProductDraft | null>(null);
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [catDraft, setCatDraft] = useState<{ id?: string; name: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [priceEdit, setPriceEdit] = useState<{ id: string; value: string } | null>(null);

  const real = isRealBranchId(branchId);

  useEffect(() => {
    if (!real) return;
    let alive = true;
    void Promise.all([fetchMenuCategories(branchId), fetchMenuProducts(branchId)]).then(
      async ([cats, items]) => {
        if (!alive) return;
        const catList = cats.ok ? cats.data : [];
        const prodList = items.ok ? items.data : [];
        const synced = await syncMissingCategories(branchId, prodList, catList);
        if (!alive) return;
        setCategories(synced);
        setProducts(prodList);
        setSelected((cur) =>
          cur ?? synced[0]?.id ?? (prodList.some((p) => !p.category?.trim()) ? UNCAT : null),
        );
      },
    );
    return () => {
      alive = false;
    };
  }, [branchId, real]);

  const sortedCats = useMemo(
    () => [...(categories ?? [])].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [categories],
  );
  const uncategorized = (products ?? []).filter((p) => !p.category?.trim());
  const selectedCat = sortedCats.find((c) => c.id === selected) ?? null;
  const selectedName = selected === UNCAT ? null : selectedCat?.name ?? null;

  const visibleProducts = useMemo(() => {
    const list = products ?? [];
    const inCat =
      selected === UNCAT
        ? list.filter((p) => !p.category?.trim())
        : selectedName
          ? list.filter((p) => sameCat(p.category, selectedName))
          : list;
    const q = query.trim().toLowerCase();
    return [...inCat]
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }, [products, selected, selectedName, query]);

  if (!visibles.pagos) return <NoAccess />;
  if (!real) {
    return <EmptyState title={t("carta.titulo")} body={t("carta.elegirSucursal")} />;
  }
  if (!categories || !products) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <MascotLoader className="h-16" />
      </div>
    );
  }

  const countIn = (name: string | null) =>
    products.filter((p) => (name ? sameCat(p.category, name) : !p.category?.trim())).length;

  const openCategory = (id: string) => {
    setSelected(id);
    setPane("productos");
  };

  const saveProduct = async () => {
    if (!productDraft || busy) return;
    setBusy(true);
    setFormError(null);
    const current = editingProduct ? products.find((p) => p.id === editingProduct) : null;
    const res = await saveMenuProduct(
      branchId,
      payloadFromDraft(productDraft, current?.order ?? products.length),
      editingProduct ?? undefined,
    );
    setBusy(false);
    if (!res.ok) {
      setFormError(res.message);
      return;
    }
    setProducts((list) => {
      const rest = (list ?? []).filter((i) => i.id !== res.product.id);
      return [...rest, res.product];
    });
    if (res.product.category) {
      setCategories((list) => {
        const have = (list ?? []).some((c) => sameCat(c.name, res.product.category));
        if (have) return list;
        return [
          ...(list ?? []),
          {
            id: `tmp-${res.product.category}`,
            name: res.product.category!,
            active: true,
            order: (list ?? []).length,
          },
        ];
      });
    }
    setProductDraft(null);
    setEditingProduct(null);
    toast(t("carta.guardado"), "success");
  };

  const toggleProduct = async (p: MenuProductView) => {
    const res = await saveMenuProduct(
      branchId,
      {
        name: p.name,
        description: p.description ?? undefined,
        category: p.category ?? undefined,
        price: p.price,
        cost: p.cost,
        imageUrl: p.imageUrl ?? undefined,
        active: !p.active,
        order: p.order,
      },
      p.id,
    );
    if (res.ok) {
      setProducts((list) => (list ?? []).map((i) => (i.id === p.id ? res.product : i)));
    } else toast(res.message, "error");
  };

  const savePrice = async (p: MenuProductView, raw: string) => {
    const price = Number(raw.replace(/\D/g, ""));
    setPriceEdit(null);
    if (!price || price === p.price) return;
    const res = await saveMenuProduct(
      branchId,
      {
        name: p.name,
        description: p.description ?? undefined,
        category: p.category ?? undefined,
        price,
        cost: p.cost,
        imageUrl: p.imageUrl ?? undefined,
        active: p.active,
        order: p.order,
      },
      p.id,
    );
    if (res.ok) {
      setProducts((list) => (list ?? []).map((i) => (i.id === p.id ? res.product : i)));
    } else toast(res.message, "error");
  };

  const moveProduct = async (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= visibleProducts.length) return;
    const ordered = [...visibleProducts];
    const [item] = ordered.splice(index, 1);
    ordered.splice(next, 0, item!);
    if (await reorderMenuProducts(branchId, ordered)) {
      setProducts((list) => {
        const ids = new Set(ordered.map((p) => p.id));
        const rest = (list ?? []).filter((p) => !ids.has(p.id));
        return [...rest, ...ordered.map((p, i) => ({ ...p, order: i }))];
      });
    }
  };

  const moveCategory = async (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= sortedCats.length) return;
    const ordered = [...sortedCats];
    const [item] = ordered.splice(index, 1);
    ordered.splice(next, 0, item!);
    if (await reorderMenuCategories(branchId, ordered)) {
      setCategories(ordered.map((c, i) => ({ ...c, order: i })));
    }
  };

  const saveCategory = async () => {
    if (!catDraft?.name.trim() || busy) return;
    setBusy(true);
    setFormError(null);
    const current = catDraft.id ? categories.find((c) => c.id === catDraft.id) : null;
    const res = await saveMenuCategory(
      branchId,
      {
        name: catDraft.name,
        active: current?.active ?? true,
        order: current?.order ?? categories.length,
      },
      catDraft.id,
      current?.name,
    );
    setBusy(false);
    if (!res.ok) {
      setFormError(res.message === "Ya existe una categoría con ese nombre." ? t("carta.duplicada") : res.message);
      return;
    }
    const renamed = current && !sameCat(current.name, res.category.name);
    setCategories((list) => {
      const rest = (list ?? []).filter((c) => c.id !== res.category.id);
      return [...rest, res.category];
    });
    if (renamed && current) {
      setProducts((ps) =>
        (ps ?? []).map((p) =>
          sameCat(p.category, current.name) ? { ...p, category: res.category.name } : p,
        ),
      );
    }
    setSelected(res.category.id);
    setCatDraft(null);
    toast(catDraft.id ? t("carta.categoriaGuardada") : t("carta.categoriaCreada"), "success");
  };

  const toggleCategory = async (c: MenuCategoryView) => {
    const res = await saveMenuCategory(
      branchId,
      { name: c.name, active: !c.active, order: c.order },
      c.id,
      c.name,
    );
    if (res.ok) {
      setCategories((list) => (list ?? []).map((x) => (x.id === c.id ? res.category : x)));
    } else toast(res.message, "error");
  };

  const removeCategory = async (c: MenuCategoryView) => {
    if (!window.confirm(t("carta.categoriaBorrarConfirmar", { n: c.name }))) return;
    if (await deleteMenuCategory(branchId, c)) {
      setProducts((list) =>
        (list ?? []).map((p) => (sameCat(p.category, c.name) ? { ...p, category: null } : p)),
      );
      setCategories((list) => (list ?? []).filter((x) => x.id !== c.id));
      if (selected === c.id) setSelected(UNCAT);
      toast(t("carta.categoriaBorrada"), "success");
    } else toast(t("carta.error"), "error");
  };

  const seedDefaults = async () => {
    setBusy(true);
    let order = categories.length;
    const next = [...categories];
    for (const key of DEFAULT_MENU_CATEGORY_KEYS) {
      const name = t(`carta.sugerida.${key}`);
      if (next.some((c) => sameCat(c.name, name))) continue;
      const res = await saveMenuCategory(branchId, { name, active: true, order: order++ });
      if (res.ok) next.push(res.category);
    }
    setCategories(next);
    if (!selected && next[0]) setSelected(next[0].id);
    setBusy(false);
  };

  const runImport = async (rows: MenuImportRow[]) => {
    setBusy(true);
    const result = await importMenuRows(branchId, rows, [...products], categories.length);
    const [cats, items] = await Promise.all([
      fetchMenuCategories(branchId),
      fetchMenuProducts(branchId),
    ]);
    if (cats.ok) setCategories(cats.data);
    if (items.ok) setProducts(items.data);
    setBusy(false);
    setImportOpen(false);
    toast(
      [
        t("carta.importarOk", { n: result.created }),
        result.skipped ? t("carta.importarSkip", { n: result.skipped }) : "",
        result.failed ? t("carta.importarFail", { n: result.failed }) : "",
      ]
        .filter(Boolean)
        .join(" "),
      result.failed ? "error" : "success",
    );
  };

  const actions = (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => {
          setEditingProduct(null);
          setFormError(null);
          setProductDraft(emptyProductDraft(selectedName ?? ""));
        }}
        className="min-h-11 rounded-full bg-marca px-4 text-sm font-semibold text-crema"
      >
        {t("carta.crearProducto")}
      </button>
      <button
        type="button"
        onClick={() => {
          setFormError(null);
          setCatDraft({ name: "" });
        }}
        className="min-h-11 rounded-full border-2 border-marca px-4 text-sm font-semibold text-marca"
      >
        {t("carta.crearCategoria")}
      </button>
      <button
        type="button"
        onClick={() => setImportOpen(true)}
        className="min-h-11 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/70"
      >
        {t("carta.importarExcel")}
      </button>
      <button
        type="button"
        onClick={() => setPane("preview")}
        className="min-h-11 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/70 lg:hidden"
      >
        {t("carta.verMenu")}
      </button>
    </div>
  );

  const categoryList = (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-[24px] border border-linea bg-surface">
      <div className="flex items-center justify-between border-b border-linea px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon/45">
          {t("carta.categorias")}
        </p>
      </div>
      <ul className="u-scroll min-h-0 flex-1 overflow-y-auto p-2">
        {sortedCats.map((c, i) => (
          <li key={c.id}>
            <div
              className={`flex items-center gap-1 rounded-2xl px-2 py-2 ${
                selected === c.id ? "bg-marca/10" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => openCategory(c.id)}
                className="min-w-0 flex-1 text-left"
              >
                <p className={`truncate text-sm font-semibold ${c.active ? "text-carbon" : "text-carbon/40"}`}>
                  {c.name}
                </p>
                <p className="text-[11px] text-carbon/45">
                  {countIn(c.name) === 1
                    ? t("carta.nProducto")
                    : t("carta.nProductos", { n: countIn(c.name) })}
                </p>
              </button>
              <div className="hidden items-center gap-1 sm:flex">
                <button type="button" className="px-1 text-carbon/40" onClick={() => void moveCategory(i, -1)} aria-label={t("carta.subir")}>
                  ↑
                </button>
                <button type="button" className="px-1 text-carbon/40" onClick={() => void moveCategory(i, 1)} aria-label={t("carta.bajar")}>
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => void toggleCategory(c)}
                  className="text-[10px] font-semibold text-carbon/50"
                >
                  {c.active ? t("carta.ocultar") : t("carta.mostrar")}
                </button>
                <button
                  type="button"
                  onClick={() => setCatDraft({ id: c.id, name: c.name })}
                  className="text-[10px] font-semibold text-carbon/50"
                >
                  {t("carta.editar")}
                </button>
                <button
                  type="button"
                  onClick={() => void removeCategory(c)}
                  className="text-[10px] font-semibold text-red-600"
                >
                  {t("carta.borrar")}
                </button>
              </div>
            </div>
          </li>
        ))}
        {uncategorized.length > 0 && (
          <li>
            <button
              type="button"
              onClick={() => openCategory(UNCAT)}
              className={`w-full rounded-2xl px-3 py-2 text-left ${selected === UNCAT ? "bg-marca/10" : ""}`}
            >
              <p className="text-sm font-semibold text-carbon/70">{t("carta.sinCategoria")}</p>
              <p className="text-[11px] text-carbon/45">
                {t("carta.nProductos", { n: uncategorized.length })}
              </p>
            </button>
          </li>
        )}
      </ul>
      {!sortedCats.length && (
        <div className="px-4 pb-4">
          <p className="text-xs text-carbon/55">{t("carta.sugeridasSub")}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void seedDefaults()}
            className="mt-2 min-h-10 w-full rounded-full border border-linea text-sm font-semibold text-carbon/70"
          >
            {t("carta.sugeridasCta")}
          </button>
        </div>
      )}
    </div>
  );

  const productList = (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-[24px] border border-linea bg-surface">
      <div className="flex items-center gap-2 border-b border-linea px-4 py-3">
        <button
          type="button"
          onClick={() => setPane("categorias")}
          className="text-xs font-semibold text-marca lg:hidden"
        >
          ← {t("carta.volver")}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-carbon">
            {selected === UNCAT ? t("carta.sinCategoria") : selectedCat?.name ?? t("carta.productos")}
          </p>
        </div>
        {selectedCat && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void toggleCategory(selectedCat)}
              className="text-[10px] font-semibold text-carbon/55"
            >
              {selectedCat.active ? t("carta.ocultar") : t("carta.mostrar")}
            </button>
            <button
              type="button"
              onClick={() => setCatDraft({ id: selectedCat.id, name: selectedCat.name })}
              className="text-[10px] font-semibold text-carbon/55"
            >
              {t("carta.editar")}
            </button>
          </div>
        )}
      </div>
      <div className="border-b border-linea px-3 py-2">
        <input
          className={INPUT}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("carta.buscar")}
          aria-label={t("carta.buscar")}
        />
      </div>
      <ul className="u-scroll min-h-0 flex-1 divide-y divide-linea/70 overflow-y-auto">
        {!visibleProducts.length && (
          <li className="px-4 py-8 text-center text-sm text-carbon/55">
            {selectedCat || selected === UNCAT ? t("carta.vaciaCategoria") : t("carta.tocaCategoria")}
          </li>
        )}
        {visibleProducts.map((p, i) => (
          <li key={p.id} className={`flex flex-wrap items-center gap-2 px-3 py-2.5 ${p.active ? "" : "opacity-50"}`}>
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.imageUrl} alt="" className="size-10 rounded-lg object-cover" />
            ) : null}
            <button
              type="button"
              onClick={() => {
                setEditingProduct(p.id);
                setFormError(null);
                setProductDraft(draftFromProduct(p));
              }}
              className="min-w-0 flex-1 text-left"
            >
              <p className="truncate text-sm font-semibold text-carbon">{p.name}</p>
              {p.description && (
                <p className="truncate text-xs text-carbon/55">{p.description}</p>
              )}
            </button>
            {priceEdit?.id === p.id ? (
              <input
                autoFocus
                className="w-24 rounded-lg border border-marca bg-crema/40 px-2 py-1 text-sm tabular-nums"
                value={priceEdit.value}
                inputMode="numeric"
                aria-label={t("carta.precioRapido")}
                onChange={(e) => setPriceEdit({ id: p.id, value: e.target.value.replace(/\D/g, "") })}
                onBlur={() => void savePrice(p, priceEdit.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void savePrice(p, priceEdit.value);
                  if (e.key === "Escape") setPriceEdit(null);
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setPriceEdit({ id: p.id, value: String(p.price) })}
                className="text-sm font-semibold tabular-nums text-carbon"
              >
                {formatMoney(p.price)}
              </button>
            )}
            <button
              type="button"
              onClick={() => void toggleProduct(p)}
              className="text-[10px] font-semibold text-carbon/55"
            >
              {p.active ? t("carta.ocultar") : t("carta.mostrar")}
            </button>
            <button type="button" className="px-1 text-carbon/40" onClick={() => void moveProduct(i, -1)} aria-label={t("carta.subir")}>
              ↑
            </button>
            <button type="button" className="px-1 text-carbon/40" onClick={() => void moveProduct(i, 1)} aria-label={t("carta.bajar")}>
              ↓
            </button>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(t("carta.borrarConfirmar", { n: p.name }))) return;
                void deleteMenuProduct(p.id).then((ok) => {
                  if (ok) setProducts((list) => (list ?? []).filter((x) => x.id !== p.id));
                  else toast(t("carta.error"), "error");
                });
              }}
              className="text-[10px] font-semibold text-red-600"
            >
              {t("carta.borrar")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="flex min-h-[70vh] flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-tight text-carbon sm:text-4xl">
            {t("carta.titulo")}
          </h1>
          <p className="mt-1 text-sm text-carbon/55">{t("carta.sub")}</p>
          <p className="mt-1 text-xs text-carbon/40">
            {t("carta.resumen", { cats: sortedCats.length, items: products.length })}
          </p>
        </div>
        {actions}
      </div>

      <div className="hidden min-h-[32rem] gap-3 lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)_20rem] lg:items-stretch">
        {categoryList}
        {productList}
        <MenuPreview
          title={t("carta.preview")}
          empty={t("carta.vacia")}
          uncategorized={t("carta.sinCategoria")}
          categories={sortedCats}
          products={products}
        />
      </div>

      <div className="flex min-h-[28rem] flex-col lg:hidden">
        {pane === "categorias" && categoryList}
        {pane === "productos" && productList}
        {pane === "preview" && (
          <div className="flex min-h-[28rem] flex-col gap-2">
            <button
              type="button"
              onClick={() => setPane("productos")}
              className="self-start text-xs font-semibold text-marca"
            >
              ← {t("carta.volver")}
            </button>
            <MenuPreview
              title={t("carta.preview")}
              empty={t("carta.vacia")}
              uncategorized={t("carta.sinCategoria")}
              categories={sortedCats}
              products={products}
            />
          </div>
        )}
      </div>

      {productDraft && (
        <MenuProductDrawer
          draft={productDraft}
          setDraft={setProductDraft}
          categories={sortedCats}
          editing={Boolean(editingProduct)}
          busy={busy}
          error={formError}
          onClose={() => {
            setProductDraft(null);
            setEditingProduct(null);
          }}
          onSave={() => void saveProduct()}
        />
      )}

      {catDraft && (
        <ModalShell
          labelledBy="carta-categoria"
          busy={busy}
          onClose={() => setCatDraft(null)}
          footer={
            <button
              type="button"
              onClick={() => void saveCategory()}
              disabled={busy || !catDraft.name.trim()}
              className="min-h-11 w-full rounded-full bg-marca px-4 text-sm font-semibold text-crema disabled:opacity-50"
            >
              {catDraft.id ? t("carta.guardar") : t("carta.crearCategoria")}
            </button>
          }
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id="carta-categoria" className="font-display text-2xl uppercase tracking-tight text-carbon">
              {catDraft.id ? t("carta.editar") : t("carta.nuevaCategoria")}
            </h2>
            <ModalCloseBtn onClick={() => setCatDraft(null)} label={t("carta.cancelar")} />
          </div>
          <label className="mt-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-carbon/55">{t("carta.categoriaNombre")}</span>
            <input
              className={INPUT}
              autoFocus
              maxLength={40}
              value={catDraft.name}
              onChange={(e) => setCatDraft({ ...catDraft, name: e.target.value })}
            />
          </label>
          {formError && <p className="mt-2 text-xs text-red-600">{formError}</p>}
        </ModalShell>
      )}

      {importOpen && (
        <MenuImportWizard
          busy={busy}
          onClose={() => setImportOpen(false)}
          onImport={runImport}
        />
      )}
    </div>
  );
};
