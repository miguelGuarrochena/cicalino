"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useToast } from "@/components/ui/Toast";
import { useSessionStore } from "@/lib/store/session-store";
import { useConfigStore } from "@/lib/store/config-store";
import { useOperationalAccess } from "@/lib/hooks/useOperationalAccess";
import { isRealBranchId } from "@/lib/data/orders";
import { NoAccess } from "@/components/ui/NoAccess";
import { EmptyState } from "@/components/ui/EmptyState";
import { MascotLoader } from "@/components/ui/MascotLoader";
import { formatMoney } from "@/lib/tableBill";
import { DEFAULT_MENU_CATEGORY_KEYS, type MenuImportRow } from "@/lib/menuImport";
import { categoryKey } from "@/lib/menuView";
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
import {
  MenuProductDrawer,
  draftFromProduct,
  emptyProductDraft,
  type ProductDraft,
} from "@/components/panel/menu/MenuProductDrawer";
import { MenuImportWizard } from "@/components/panel/menu/MenuImportWizard";
import { MenuPreviewDialog } from "@/components/panel/menu/MenuPreviewDialog";
import { CategoryDialog, type CategoryDraft } from "@/components/panel/menu/CategoryDialog";
import { AvailabilitySwitch, RowMenu, type RowMenuItem } from "@/components/panel/menu/RowMenu";

const ALL = "__all__";
const UNCAT = "__uncat__";

/* Phones show one level at a time: categories, then that category's
 * products. Editing opens as a sheet over either. */
type MobileLevel = "categorias" | "productos";

const sameCat = (a: string | null | undefined, b: string | null | undefined) =>
  categoryKey(a) === categoryKey(b);

const productPayload = (p: MenuProductView, patch: Partial<MenuProductView> = {}) => {
  const next = { ...p, ...patch };
  return {
    name: next.name,
    description: next.description ?? undefined,
    category: next.category ?? undefined,
    price: next.price,
    cost: next.cost,
    imageUrl: next.imageUrl ?? undefined,
    active: next.active,
    order: next.order,
  };
};

const draftPayload = (d: ProductDraft, order: number) => ({
  name: d.name,
  description: d.description,
  category: d.category,
  price: Number(d.price.replace(/\D/g, "")),
  cost: d.cost ? Number(d.cost.replace(/\D/g, "")) : null,
  imageUrl: d.imageUrl || undefined,
  active: d.active,
  order,
});

const byOrder = <T extends { order: number; name: string }>(a: T, b: T) =>
  a.order - b.order || a.name.localeCompare(b.name);

export const MenuWorkspace = () => {
  const { t } = useApp();
  const toast = useToast();
  const branchId = useSessionStore((s) => s.sucursalId);
  const branchName = useConfigStore((s) => s.name);
  const { visibles, canManage, ready } = useOperationalAccess();
  const real = isRealBranchId(branchId);

  const [categories, setCategories] = useState<MenuCategoryView[] | null>(null);
  const [products, setProducts] = useState<MenuProductView[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<string>(ALL);
  const [level, setLevel] = useState<MobileLevel>("categorias");
  const [query, setQuery] = useState("");
  const [productDraft, setProductDraft] = useState<ProductDraft | null>(null);
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [catDraft, setCatDraft] = useState<CategoryDraft | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [priceEdit, setPriceEdit] = useState<{ id: string; value: string } | null>(null);

  const load = async () => {
    if (!real) return;
    const [cats, items] = await Promise.all([fetchMenuCategories(branchId), fetchMenuProducts(branchId)]);
    if (!cats.ok || !items.ok) {
      setLoadError(true);
      if (cats.ok) setCategories(cats.data);
      else setCategories((c) => c ?? []);
      if (items.ok) setProducts(items.data);
      else setProducts((p) => p ?? []);
      return;
    }
    setLoadError(false);
    /* Older menus stored only the category name on each product: give those
     * names a row so they can be ordered and hidden like any other. */
    setCategories(await syncMissingCategories(branchId, items.data, cats.data));
    setProducts(items.data);
  };

  useEffect(() => {
    if (!real || !canManage || !visibles.pagos) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, real, canManage, visibles.pagos]);

  const sortedCats = useMemo(() => [...(categories ?? [])].sort(byOrder), [categories]);
  const allProducts = useMemo(() => products ?? [], [products]);
  const uncategorized = allProducts.filter((p) => !p.category?.trim());
  const selectedCat = sortedCats.find((c) => c.id === selected) ?? null;

  const visibleProducts = useMemo(() => {
    const inScope =
      selected === ALL
        ? allProducts
        : selected === UNCAT
          ? allProducts.filter((p) => !p.category?.trim())
          : allProducts.filter((p) => sameCat(p.category, selectedCat?.name));
    const q = query.trim().toLowerCase();
    const filtered = q
      ? inScope.filter(
          (p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q),
        )
      : inScope;
    if (selected !== ALL) return [...filtered].sort(byOrder);
    /* "Todas" reads like the menu: grouped by category order. */
    const catIndex = new Map(sortedCats.map((c, i) => [categoryKey(c.name), i]));
    return [...filtered].sort(
      (a, b) =>
        (catIndex.get(categoryKey(a.category)) ?? 999) - (catIndex.get(categoryKey(b.category)) ?? 999) ||
        byOrder(a, b),
    );
  }, [allProducts, selected, selectedCat, sortedCats, query]);

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <MascotLoader className="h-16" />
      </div>
    );
  }
  if (!canManage) return <NoAccess />;
  if (!visibles.pagos) {
    return <EmptyState title={t("carta.titulo")} body={t("carta.sinModulo")} />;
  }
  if (!real) return <EmptyState title={t("carta.titulo")} body={t("carta.elegirSucursal")} />;
  if (!categories || !products) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <MascotLoader className="h-16" />
      </div>
    );
  }

  const countIn = (name: string | null) =>
    allProducts.filter((p) => (name ? sameCat(p.category, name) : !p.category?.trim())).length;
  const unavailable = allProducts.filter((p) => !p.active).length;

  const replaceProduct = (next: MenuProductView) =>
    setProducts((list) => (list ?? []).map((p) => (p.id === next.id ? next : p)));

  const errorOf = (message: string) =>
    message === "Ya existe una categoría con ese nombre." ? t("carta.duplicada") : message;

  /* ---- Products ---------------------------------------------------------- */

  const openNewProduct = () => {
    setEditingProduct(null);
    setFormError(null);
    setProductDraft(emptyProductDraft(selectedCat?.name ?? ""));
  };

  const openProduct = (p: MenuProductView) => {
    setEditingProduct(p.id);
    setFormError(null);
    setProductDraft(draftFromProduct(p));
  };

  const saveProduct = async () => {
    if (!productDraft || busy) return;
    setBusy(true);
    setFormError(null);
    const current = editingProduct ? allProducts.find((p) => p.id === editingProduct) : null;
    const order = current?.order ?? allProducts.reduce((m, p) => Math.max(m, p.order + 1), 0);
    const res = await saveMenuProduct(branchId, draftPayload(productDraft, order), editingProduct ?? undefined);
    setBusy(false);
    if (!res.ok) {
      setFormError(res.message);
      return;
    }
    setProducts((list) => [...(list ?? []).filter((p) => p.id !== res.product.id), res.product]);
    if (res.product.category && !sortedCats.some((c) => sameCat(c.name, res.product.category))) {
      setCategories(await syncMissingCategories(branchId, [res.product], sortedCats));
    }
    setProductDraft(null);
    setEditingProduct(null);
    toast(t("carta.guardado"), "success");
  };

  const patchProduct = async (p: MenuProductView, patch: Partial<MenuProductView>, okMsg?: string) => {
    replaceProduct({ ...p, ...patch });
    const res = await saveMenuProduct(branchId, productPayload(p, patch), p.id);
    if (res.ok) {
      replaceProduct(res.product);
      if (okMsg) toast(okMsg, "success");
    } else {
      replaceProduct(p);
      toast(res.message, "error");
    }
  };

  const savePrice = async (p: MenuProductView, raw: string) => {
    setPriceEdit(null);
    const price = Number(raw.replace(/\D/g, ""));
    if (!price || price === p.price) return;
    await patchProduct(p, { price }, t("carta.precioGuardado"));
  };

  const removeProduct = async (p: MenuProductView) => {
    if (!window.confirm(t("carta.borrarConfirmar", { n: p.name }))) return;
    if (await deleteMenuProduct(p.id)) {
      setProducts((list) => (list ?? []).filter((x) => x.id !== p.id));
      setProductDraft(null);
      setEditingProduct(null);
      toast(t("carta.productoBorrado"), "success");
    } else {
      toast(t("carta.error"), "error");
    }
  };

  const moveProduct = async (p: MenuProductView, dir: -1 | 1) => {
    const list = visibleProducts;
    const index = list.findIndex((x) => x.id === p.id);
    const next = index + dir;
    if (index < 0 || next < 0 || next >= list.length) return;
    const ordered = [...list];
    const [item] = ordered.splice(index, 1);
    ordered.splice(next, 0, item!);
    if (await reorderMenuProducts(branchId, ordered)) {
      const orderById = new Map(ordered.map((x, i) => [x.id, i]));
      setProducts((all) =>
        (all ?? []).map((x) => (orderById.has(x.id) ? { ...x, order: orderById.get(x.id)! } : x)),
      );
    } else {
      toast(t("carta.error"), "error");
    }
  };

  /* ---- Categories -------------------------------------------------------- */

  const saveCategory = async () => {
    if (!catDraft?.name.trim() || busy) return;
    setBusy(true);
    setFormError(null);
    const current = catDraft.id ? sortedCats.find((c) => c.id === catDraft.id) : null;
    const res = await saveMenuCategory(
      branchId,
      { name: catDraft.name, active: catDraft.active, order: current?.order ?? sortedCats.length },
      catDraft.id,
      current?.name,
    );
    setBusy(false);
    if (!res.ok) {
      setFormError(errorOf(res.message));
      return;
    }
    setCategories((list) => [...(list ?? []).filter((c) => c.id !== res.category.id), res.category]);
    if (current && !sameCat(current.name, res.category.name)) {
      setProducts((list) =>
        (list ?? []).map((p) => (sameCat(p.category, current.name) ? { ...p, category: res.category.name } : p)),
      );
    }
    if (!current) {
      setSelected(res.category.id);
      setLevel("productos");
    }
    setCatDraft(null);
    toast(current ? t("carta.categoriaGuardada") : t("carta.categoriaCreada"), "success");
  };

  const toggleCategory = async (c: MenuCategoryView) => {
    const res = await saveMenuCategory(branchId, { name: c.name, active: !c.active, order: c.order }, c.id, c.name);
    if (res.ok) {
      setCategories((list) => (list ?? []).map((x) => (x.id === c.id ? res.category : x)));
      toast(res.category.active ? t("carta.categoriaVisibleOk") : t("carta.categoriaOcultaOk"), "success");
    } else {
      toast(errorOf(res.message), "error");
    }
  };

  const removeCategory = async (c: MenuCategoryView) => {
    const n = countIn(c.name);
    const msg = n
      ? t("carta.categoriaBorrarConProductos", { n: c.name, cantidad: n })
      : t("carta.categoriaBorrarConfirmar", { n: c.name });
    if (!window.confirm(msg)) return;
    setBusy(true);
    const ok = await deleteMenuCategory(branchId, c);
    setBusy(false);
    if (!ok) {
      toast(t("carta.error"), "error");
      return;
    }
    setProducts((list) => (list ?? []).map((p) => (sameCat(p.category, c.name) ? { ...p, category: null } : p)));
    setCategories((list) => (list ?? []).filter((x) => x.id !== c.id));
    if (selected === c.id) setSelected(ALL);
    setCatDraft(null);
    toast(t("carta.categoriaBorrada"), "success");
  };

  const moveCategory = async (c: MenuCategoryView, dir: -1 | 1) => {
    const index = sortedCats.findIndex((x) => x.id === c.id);
    const next = index + dir;
    if (index < 0 || next < 0 || next >= sortedCats.length) return;
    const ordered = [...sortedCats];
    const [item] = ordered.splice(index, 1);
    ordered.splice(next, 0, item!);
    if (await reorderMenuCategories(branchId, ordered)) {
      setCategories(ordered.map((x, i) => ({ ...x, order: i })));
    } else {
      toast(t("carta.error"), "error");
    }
  };

  const seedDefaults = async () => {
    if (busy) return;
    setBusy(true);
    try {
      let order = sortedCats.length;
      const next = [...sortedCats];
      let failed = 0;
      for (const key of DEFAULT_MENU_CATEGORY_KEYS) {
        const name = t(`carta.sugerida.${key}`);
        if (next.some((c) => sameCat(c.name, name))) continue;
        const res = await saveMenuCategory(branchId, { name, active: true, order: order++ });
        if (res.ok) next.push(res.category);
        else failed++;
      }
      setCategories(next);
      if (failed) toast(t("carta.error"), "error");
    } finally {
      setBusy(false);
    }
  };

  const runImport = async (rows: MenuImportRow[]) => {
    setBusy(true);
    const result = await importMenuRows(branchId, rows, [...allProducts]);
    await load();
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

  const selectScope = (id: string) => {
    setSelected(id);
    setQuery("");
    setLevel("productos");
  };

  const scopeTitle =
    selected === ALL ? t("carta.todas") : selected === UNCAT ? t("carta.sinCategoria") : selectedCat?.name ?? "";

  /* ---- Pieces ------------------------------------------------------------- */

  const scopeButton = (id: string, label: string, count: number, muted = false) => (
    <button
      type="button"
      onClick={() => selectScope(id)}
      aria-current={selected === id ? "true" : undefined}
      className={`flex min-h-12 min-w-0 flex-1 items-center justify-between gap-2 rounded-2xl px-3 text-left transition ${
        selected === id ? "bg-marca text-crema lg:bg-marca" : "hover:bg-carbon/5"
      }`}
    >
      <span className={`truncate text-sm font-semibold ${selected === id ? "" : muted ? "text-carbon/45" : "text-carbon"}`}>
        {label}
      </span>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
          selected === id ? "bg-crema/20 text-crema" : "bg-carbon/5 text-carbon/55"
        }`}
      >
        {count}
      </span>
    </button>
  );

  const categoryItems = (c: MenuCategoryView, index: number): RowMenuItem[] => [
    { label: t("carta.editarCategoria"), onSelect: () => { setFormError(null); setCatDraft({ id: c.id, name: c.name, active: c.active }); } },
    { label: c.active ? t("carta.ocultarCategoria") : t("carta.mostrarCategoria"), onSelect: () => void toggleCategory(c) },
    { label: t("carta.subir"), onSelect: () => void moveCategory(c, -1), disabled: index === 0 },
    { label: t("carta.bajar"), onSelect: () => void moveCategory(c, 1), disabled: index === sortedCats.length - 1 },
    { label: t("carta.borrarCategoria"), onSelect: () => void removeCategory(c), danger: true },
  ];

  const categoryRail = (
    <nav
      aria-label={t("carta.categorias")}
      className="flex flex-col rounded-[24px] border border-linea bg-surface p-2 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)]"
    >
      <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-carbon/45">
        {t("carta.categorias")}
      </p>
      <ul className="u-scroll flex min-h-0 flex-col gap-0.5 overflow-y-auto">
        <li className="flex">{scopeButton(ALL, t("carta.todas"), allProducts.length)}</li>
        {sortedCats.map((c, i) => (
          <li key={c.id} className="flex items-center gap-1">
            {scopeButton(c.id, c.name, countIn(c.name), !c.active)}
            {!c.active && (
              <span className="shrink-0 rounded-full bg-carbon/5 px-2 py-0.5 text-[10px] font-semibold text-carbon/50">
                {t("carta.oculta")}
              </span>
            )}
            <RowMenu label={t("carta.accionesCategoria", { n: c.name })} items={categoryItems(c, i)} />
          </li>
        ))}
        {uncategorized.length > 0 && (
          <li className="flex">{scopeButton(UNCAT, t("carta.sinCategoria"), uncategorized.length, true)}</li>
        )}
      </ul>
      <button
        type="button"
        onClick={() => {
          setFormError(null);
          setCatDraft({ name: "", active: true });
        }}
        className="mt-2 flex min-h-12 items-center justify-center gap-1 rounded-2xl border border-dashed border-linea text-sm font-semibold text-marca hover:border-marca/50"
      >
        + {t("carta.nuevaCategoria")}
      </button>
      {!sortedCats.length && (
        <div className="mt-3 rounded-2xl bg-crema/60 p-3">
          <p className="text-xs text-carbon/60">{t("carta.sugeridasSub")}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void seedDefaults()}
            className="mt-2 min-h-10 w-full rounded-full border border-linea bg-surface text-sm font-semibold text-carbon/75 disabled:opacity-50"
          >
            {t("carta.sugeridasCta")}
          </button>
        </div>
      )}
    </nav>
  );

  const productRow = (p: MenuProductView) => {
    const withinCategory = selected !== ALL && !query.trim();
    const index = visibleProducts.findIndex((x) => x.id === p.id);
    const moveTargets: RowMenuItem[] = [
      { kind: "heading", label: t("carta.moverA") },
      ...sortedCats
        .filter((c) => !sameCat(c.name, p.category))
        .map((c) => ({ label: c.name, onSelect: () => void patchProduct(p, { category: c.name }, t("carta.movido", { n: c.name })) })),
      ...(p.category?.trim()
        ? [{ label: t("carta.sinCategoria"), onSelect: () => void patchProduct(p, { category: null }, t("carta.movido", { n: t("carta.sinCategoria") })) }]
        : []),
    ];
    const items: RowMenuItem[] = [
      { label: t("carta.editarProducto"), onSelect: () => openProduct(p) },
      ...(withinCategory
        ? [
            { label: t("carta.subir"), onSelect: () => void moveProduct(p, -1), disabled: index === 0 },
            { label: t("carta.bajar"), onSelect: () => void moveProduct(p, 1), disabled: index === visibleProducts.length - 1 },
          ]
        : []),
      ...(moveTargets.length > 1 ? moveTargets : []),
      { kind: "divider" },
      { label: t("carta.borrarProducto"), onSelect: () => void removeProduct(p), danger: true },
    ];
    const margin = p.cost != null && p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : null;

    return (
      <li key={p.id} className="flex gap-3 px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={() => openProduct(p)}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          aria-label={t("carta.editarN", { n: p.name })}
        >
          {p.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrl} alt="" className={`size-14 shrink-0 rounded-xl object-cover ${p.active ? "" : "opacity-50 grayscale"}`} />
          ) : (
            <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-xl bg-marca/10 font-display text-xl uppercase text-marca/60">
              {p.name.trim()[0] ?? "?"}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className={`block truncate font-semibold ${p.active ? "text-carbon" : "text-carbon/45"}`}>{p.name}</span>
            {p.description && <span className="mt-0.5 line-clamp-2 block text-xs text-carbon/55">{p.description}</span>}
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-carbon/45">
              {selected === ALL && <span>{p.category?.trim() || t("carta.sinCategoria")}</span>}
              {p.cost != null && (
                <span>
                  {t("carta.costoCorto", { n: formatMoney(p.cost) })}
                  {margin != null ? ` · ${t("carta.margenCorto", { n: margin })}` : ""}
                </span>
              )}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
          {priceEdit?.id === p.id ? (
            <input
              autoFocus
              className="h-10 w-28 rounded-xl border border-marca bg-crema/40 px-2 text-right text-sm font-semibold tabular-nums"
              value={priceEdit.value}
              inputMode="numeric"
              aria-label={t("carta.precioDe", { n: p.name })}
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
              title={t("carta.precioRapido")}
              aria-label={t("carta.cambiarPrecioDe", { n: p.name })}
              className="min-h-10 rounded-xl border border-transparent px-2 text-right font-semibold tabular-nums text-carbon transition hover:border-linea hover:bg-crema/60"
            >
              {formatMoney(p.price)}
            </button>
          )}
          <AvailabilitySwitch
            checked={p.active}
            onChange={(active) =>
              void patchProduct(p, { active }, active ? t("carta.ahoraDisponible", { n: p.name }) : t("carta.ahoraNoDisponible", { n: p.name }))
            }
            labelOn={t("carta.disponible")}
            labelOff={t("carta.noDisponible")}
          />
        </div>
        <RowMenu label={t("carta.accionesProducto", { n: p.name })} items={items} />
      </li>
    );
  };

  const productPanel = (
    <section className="flex min-w-0 flex-col rounded-[24px] border border-linea bg-surface">
      <header className="flex flex-col gap-3 border-b border-linea p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLevel("categorias")}
            className="min-h-10 shrink-0 pr-2 text-sm font-semibold text-marca lg:hidden"
          >
            ← {t("carta.categorias")}
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-2xl uppercase tracking-tight text-carbon">{scopeTitle}</h2>
            <p className="text-xs text-carbon/50">
              {visibleProducts.length === 1 ? t("carta.nProducto") : t("carta.nProductos", { n: visibleProducts.length })}
              {selectedCat && !selectedCat.active ? ` · ${t("carta.categoriaOcultaCorto")}` : ""}
            </p>
          </div>
          {selectedCat && (
            <RowMenu
              label={t("carta.accionesCategoria", { n: selectedCat.name })}
              items={categoryItems(selectedCat, sortedCats.findIndex((c) => c.id === selectedCat.id))}
            />
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="min-w-0 flex-1">
            <span className="sr-only">{t("carta.buscar")}</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("carta.buscar")}
              className="min-h-11 w-full rounded-xl border border-linea bg-crema/40 px-3 text-sm outline-none focus:border-marca focus:ring-2 focus:ring-marca/20"
            />
          </label>
          <button
            type="button"
            onClick={openNewProduct}
            className="min-h-11 shrink-0 rounded-xl border border-marca/40 px-4 text-sm font-semibold text-marca hover:bg-marca/5"
          >
            + {selectedCat ? t("carta.productoEn", { n: selectedCat.name }) : t("carta.nuevoProducto")}
          </button>
        </div>
      </header>

      {visibleProducts.length ? (
        <ul className="divide-y divide-linea/70">{visibleProducts.map(productRow)}</ul>
      ) : (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <p className="text-sm text-carbon/55">
            {query.trim() ? t("carta.sinResultados") : selected === ALL ? t("carta.vacia") : t("carta.vaciaCategoria")}
          </p>
          {!query.trim() && (
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={openNewProduct} className="min-h-11 rounded-full bg-marca px-5 text-sm font-semibold text-crema">
                {t("carta.crearProducto")}
              </button>
              {selected === ALL && (
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  className="min-h-11 rounded-full border border-linea px-5 text-sm font-semibold text-carbon/70"
                >
                  {t("carta.importarExcel")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );

  /* ---- Page --------------------------------------------------------------- */

  return (
    <div className="flex flex-col gap-4 pb-6">
      <header className="flex flex-col gap-4">
        <Link href="/panel/config" className="self-start text-sm font-semibold text-carbon/55 hover:text-carbon">
          ← {t("carta.volverConfig")}
        </Link>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-4xl uppercase tracking-tight text-carbon">{t("carta.titulo")}</h1>
            <p className="mt-1 text-sm text-carbon/55">
              {t("carta.resumenPagina", { cats: sortedCats.length, items: allProducts.length })}
              {unavailable ? ` · ${t("carta.nNoDisponibles", { n: unavailable })}` : ""}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={openNewProduct}
              className="col-span-2 min-h-12 rounded-full bg-marca px-5 text-sm font-semibold text-crema transition hover:bg-marca-fuerte sm:col-span-1"
            >
              + {t("carta.crearProducto")}
            </button>
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setCatDraft({ name: "", active: true });
              }}
              className="min-h-12 rounded-full border-2 border-marca px-4 text-sm font-semibold text-marca"
            >
              + {t("carta.crearCategoria")}
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="min-h-12 rounded-full border border-linea bg-surface px-4 text-sm font-semibold text-carbon/75"
            >
              {t("carta.importarExcel")}
            </button>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="col-span-2 min-h-12 rounded-full border border-linea bg-surface px-4 text-sm font-semibold text-carbon/75 sm:col-span-1"
            >
              {t("carta.verMenu")}
            </button>
          </div>
        </div>
        {loadError && (
          <p role="alert" className="rounded-2xl border border-amber-400/60 bg-amber-50/80 px-3 py-2 text-sm text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">
            {t("carta.errorCarga")}
          </p>
        )}
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div className={level === "categorias" ? "block" : "hidden lg:block"}>{categoryRail}</div>
        <div className={level === "productos" ? "block" : "hidden lg:block"}>{productPanel}</div>
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
          onDelete={
            editingProduct
              ? () => {
                  const p = allProducts.find((x) => x.id === editingProduct);
                  if (p) void removeProduct(p);
                }
              : undefined
          }
        />
      )}

      {catDraft && (
        <CategoryDialog
          draft={catDraft}
          setDraft={setCatDraft}
          productCount={catDraft.id ? countIn(sortedCats.find((c) => c.id === catDraft.id)?.name ?? null) : 0}
          busy={busy}
          error={formError}
          onClose={() => setCatDraft(null)}
          onSave={() => void saveCategory()}
          onDelete={
            catDraft.id
              ? () => {
                  const c = sortedCats.find((x) => x.id === catDraft.id);
                  if (c) void removeCategory(c);
                }
              : undefined
          }
        />
      )}

      {importOpen && <MenuImportWizard busy={busy} onClose={() => setImportOpen(false)} onImport={runImport} />}

      {previewOpen && (
        <MenuPreviewDialog
          branchName={branchName}
          categories={sortedCats}
          products={allProducts}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
};
