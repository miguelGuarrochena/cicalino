"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useToast } from "@/components/ui/Toast";
import {
  deleteMenuProduct,
  fetchMenuProducts,
  saveMenuProduct,
  type MenuProductView,
} from "@/lib/data/tables";
import { formatMoney } from "@/lib/tableBill";

const INPUT =
  "w-full rounded-xl border border-linea bg-crema/40 px-3 py-2.5 text-sm text-carbon outline-none focus:border-marca focus:ring-2 focus:ring-marca/20";

type Draft = { name: string; description: string; category: string; price: string };
const EMPTY: Draft = { name: "", description: "", category: "", price: "" };

/* The branch menu. Guests order from it; each order copies name and price, so
 * editing or deleting a product never changes a bill already on a table. */
export const MenuEditor = ({ branchId }: { branchId: string }) => {
  const { t } = useApp();
  const toast = useToast();
  const [items, setItems] = useState<MenuProductView[] | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchMenuProducts(branchId).then((r) => {
      if (alive) setItems(r.ok ? r.data : []);
    });
    return () => {
      alive = false;
    };
  }, [branchId]);

  const startEdit = (p: MenuProductView) => {
    setEditing(p.id);
    setError(null);
    setDraft({
      name: p.name,
      description: p.description ?? "",
      category: p.category ?? "",
      price: String(p.price),
    });
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const current = editing ? items?.find((i) => i.id === editing) : null;
    const res = await saveMenuProduct(
      branchId,
      {
        name: draft.name,
        description: draft.description,
        category: draft.category,
        price: Number(draft.price.replace(/\D/g, "")),
        active: current?.active ?? true,
        order: current?.order ?? (items?.length ?? 0),
      },
      editing ?? undefined,
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setItems((list) => {
      const rest = (list ?? []).filter((i) => i.id !== res.product.id);
      return [...rest, res.product];
    });
    setDraft(EMPTY);
    setEditing(null);
    toast(t("carta.guardado"), "success");
  };

  const toggle = async (p: MenuProductView) => {
    const res = await saveMenuProduct(
      branchId,
      {
        name: p.name,
        description: p.description,
        category: p.category,
        price: p.price,
        active: !p.active,
        order: p.order,
      },
      p.id,
    );
    if (res.ok) {
      setItems((list) => (list ?? []).map((i) => (i.id === p.id ? res.product : i)));
    } else {
      toast(res.message, "error");
    }
  };

  const remove = async (p: MenuProductView) => {
    if (!window.confirm(t("carta.borrarConfirmar", { n: p.name }))) return;
    if (await deleteMenuProduct(p.id)) {
      setItems((list) => (list ?? []).filter((i) => i.id !== p.id));
    } else {
      toast(t("carta.error"), "error");
    }
  };

  const grouped = new Map<string, MenuProductView[]>();
  for (const p of [...(items ?? [])].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))) {
    const k = p.category?.trim() || t("mesa.sinCategoria");
    grouped.set(k, [...(grouped.get(k) ?? []), p]);
  }

  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-carbon/60">{t("carta.titulo")}</h2>
      <p className="mb-4 mt-1 text-sm text-carbon/55">{t("carta.sub")}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="grid grid-cols-1 gap-2 rounded-2xl border border-linea bg-crema/30 p-3 sm:grid-cols-[2fr_1fr_1fr_auto]"
      >
        <input
          className={INPUT}
          value={draft.name}
          maxLength={80}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder={t("carta.nombre")}
          aria-label={t("carta.nombre")}
        />
        <input
          className={INPUT}
          value={draft.category}
          maxLength={40}
          onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
          placeholder={t("carta.categoria")}
          aria-label={t("carta.categoria")}
        />
        <input
          className={INPUT}
          value={draft.price}
          inputMode="numeric"
          onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value.replace(/\D/g, "") }))}
          placeholder={t("carta.precio")}
          aria-label={t("carta.precio")}
        />
        <button
          type="submit"
          disabled={busy || !draft.name.trim() || !draft.price}
          className="min-h-11 rounded-full bg-marca px-5 text-sm font-semibold text-crema disabled:opacity-50"
        >
          {editing ? t("carta.guardar") : t("carta.agregar")}
        </button>
        <input
          className={`${INPUT} sm:col-span-4`}
          value={draft.description}
          maxLength={200}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          placeholder={t("carta.descripcion")}
          aria-label={t("carta.descripcion")}
        />
        {editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setDraft(EMPTY);
            }}
            className="justify-self-start text-xs font-semibold text-carbon/60 underline sm:col-span-4"
          >
            {t("carta.cancelarEdicion")}
          </button>
        )}
        {error && <p className="text-xs text-red-600 sm:col-span-4">{error}</p>}
      </form>

      {items && !items.length && (
        <p className="mt-4 text-sm text-carbon/55">{t("carta.vacia")}</p>
      )}

      <div className="mt-4 flex flex-col gap-4">
        {[...grouped.entries()].map(([cat, list]) => (
          <div key={cat}>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-carbon/50">{cat}</h3>
            <ul className="flex flex-col divide-y divide-linea/70 rounded-2xl border border-linea">
              {list.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                  <div className={`min-w-0 flex-1 ${p.active ? "" : "opacity-50"}`}>
                    <p className="truncate text-sm font-semibold text-carbon">{p.name}</p>
                    {p.description && <p className="truncate text-xs text-carbon/55">{p.description}</p>}
                  </div>
                  <span className="text-sm tabular-nums text-carbon">{formatMoney(p.price)}</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => void toggle(p)}
                      aria-pressed={p.active}
                      className="min-h-8 rounded-full border border-linea px-2.5 text-xs font-semibold text-carbon/70"
                    >
                      {p.active ? t("carta.ocultar") : t("carta.mostrar")}
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      className="min-h-8 rounded-full border border-linea px-2.5 text-xs font-semibold text-carbon/70"
                    >
                      {t("carta.editar")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(p)}
                      className="min-h-8 rounded-full border border-linea px-2.5 text-xs font-semibold text-red-600"
                    >
                      {t("carta.borrar")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};
