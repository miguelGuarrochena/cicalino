"use client";

import { createBrowserSupabase } from "@/lib/supabase/client";
import { ok, fail, desdeSupabase, type DataResult } from "@/lib/data/result";
import { reportError } from "@/lib/observability";
import {
  menuCategorySchema,
  menuProductSchema,
  parseInput,
} from "@/lib/schemas";
import type { MenuImportRow } from "@/lib/menuImport";
import type { z } from "zod";

export interface MenuProductView {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  cost: number | null;
  imageUrl: string | null;
  active: boolean;
  order: number;
}

export interface MenuCategoryView {
  id: string;
  name: string;
  active: boolean;
  order: number;
}

const PRODUCT_COLUMNS =
  "id, nombre, descripcion, categoria, precio, costo, imagen_url, activo, orden";
const CATEGORY_COLUMNS = "id, nombre, activa, orden";

const mapProduct = (p: Record<string, unknown>): MenuProductView => ({
  id: p.id as string,
  name: p.nombre as string,
  description: (p.descripcion as string | null) ?? null,
  category: (p.categoria as string | null) ?? null,
  price: p.precio as number,
  cost: (p.costo as number | null) ?? null,
  imageUrl: (p.imagen_url as string | null) ?? null,
  active: Boolean(p.activo),
  order: (p.orden as number) ?? 0,
});

const mapCategory = (c: Record<string, unknown>): MenuCategoryView => ({
  id: c.id as string,
  name: c.nombre as string,
  active: Boolean(c.activa),
  order: (c.orden as number) ?? 0,
});

/* Category names are matched case-insensitively with ilike. Escape its
 * wildcards so a name like "2x1_promo" can't match other categories. */
const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (c) => `\\${c}`);

const sameCat = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

export const fetchMenuProducts = async (
  branchId: string,
): Promise<DataResult<MenuProductView[]>> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return ok([]);
  const { data, error } = await supabase
    .from("productos")
    .select(PRODUCT_COLUMNS)
    .eq("local_id", branchId)
    .order("categoria", { ascending: true, nullsFirst: true })
    .order("orden")
    .order("nombre");
  if (error) {
    reportError("panel.carta.leer", error, { branchId });
    return fail(desdeSupabase(error));
  }
  return ok((data ?? []).map((p) => mapProduct(p as Record<string, unknown>)));
};

export const fetchMenuCategories = async (
  branchId: string,
): Promise<DataResult<MenuCategoryView[]>> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return ok([]);
  const { data, error } = await supabase
    .from("categorias")
    .select(CATEGORY_COLUMNS)
    .eq("local_id", branchId)
    .order("orden")
    .order("nombre");
  if (error) {
    reportError("panel.carta.categorias", error, { branchId });
    return fail(desdeSupabase(error));
  }
  return ok((data ?? []).map((c) => mapCategory(c as Record<string, unknown>)));
};

const ensureCategory = async (
  branchId: string,
  name: string | undefined,
  order: number,
): Promise<void> => {
  const trimmed = name?.trim();
  if (!trimmed) return;
  const supabase = createBrowserSupabase();
  if (!supabase) return;
  const { data } = await supabase
    .from("categorias")
    .select("id")
    .eq("local_id", branchId)
    .ilike("nombre", escapeLike(trimmed))
    .maybeSingle();
  if (data) return;
  await supabase.from("categorias").insert({
    local_id: branchId,
    nombre: trimmed,
    activa: true,
    orden: order,
  });
};

export type SaveProductResult =
  | { ok: true; product: MenuProductView }
  | { ok: false; message: string };

export const saveMenuProduct = async (
  branchId: string,
  input: z.input<typeof menuProductSchema>,
  id?: string,
): Promise<SaveProductResult> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return { ok: false, message: "Sin conexión." };
  const v = parseInput(menuProductSchema, input);
  if (!v.ok) return { ok: false, message: v.error };
  const row = {
    nombre: v.data.name,
    descripcion: v.data.description ?? null,
    categoria: v.data.category ?? null,
    precio: v.data.price,
    costo: v.data.cost ?? null,
    imagen_url: v.data.imageUrl ?? null,
    activo: v.data.active,
    orden: v.data.order,
  };
  const q = id
    ? supabase.from("productos").update(row).eq("id", id).eq("local_id", branchId)
    : supabase.from("productos").insert({ ...row, local_id: branchId });
  const { data, error } = await q.select(PRODUCT_COLUMNS).single();
  if (error || !data) {
    reportError("panel.carta.guardar", error ?? "sin fila", { branchId });
    return { ok: false, message: "No se pudo guardar el producto." };
  }
  await ensureCategory(branchId, v.data.category, v.data.order);
  return { ok: true, product: mapProduct(data as Record<string, unknown>) };
};

export const deleteMenuProduct = async (id: string): Promise<boolean> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return false;
  const { error } = await supabase.from("productos").delete().eq("id", id);
  if (error) reportError("panel.carta.borrar", error, { id });
  return !error;
};

export type SaveCategoryResult =
  | { ok: true; category: MenuCategoryView }
  | { ok: false; message: string };

export const saveMenuCategory = async (
  branchId: string,
  input: z.input<typeof menuCategorySchema>,
  id?: string,
  previousName?: string,
): Promise<SaveCategoryResult> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return { ok: false, message: "Sin conexión." };
  const v = parseInput(menuCategorySchema, input);
  if (!v.ok) return { ok: false, message: v.error };
  const row = {
    nombre: v.data.name,
    activa: v.data.active,
    orden: v.data.order,
  };
  const q = id
    ? supabase.from("categorias").update(row).eq("id", id).eq("local_id", branchId)
    : supabase.from("categorias").insert({ ...row, local_id: branchId });
  const { data, error } = await q.select(CATEGORY_COLUMNS).single();
  if (error || !data) {
    reportError("panel.carta.categoria.guardar", error ?? "sin fila", { branchId });
    const dup = String((error as { code?: string } | null)?.code ?? "") === "23505";
    return {
      ok: false,
      message: dup ? "Ya existe una categoría con ese nombre." : "No se pudo guardar la categoría.",
    };
  }
  if (id && previousName && !sameCat(previousName, v.data.name)) {
    await supabase
      .from("productos")
      .update({ categoria: v.data.name })
      .eq("local_id", branchId)
      .ilike("categoria", escapeLike(previousName.trim()));
  }
  return { ok: true, category: mapCategory(data as Record<string, unknown>) };
};

export const deleteMenuCategory = async (
  branchId: string,
  category: MenuCategoryView,
): Promise<boolean> => {
  const supabase = createBrowserSupabase();
  if (!supabase) return false;
  const { error: productsError } = await supabase
    .from("productos")
    .update({ categoria: null })
    .eq("local_id", branchId)
    .ilike("categoria", escapeLike(category.name.trim()));
  if (productsError) {
    reportError("panel.carta.categoria.vaciar", productsError, { id: category.id });
    return false;
  }
  const { error } = await supabase
    .from("categorias")
    .delete()
    .eq("id", category.id)
    .eq("local_id", branchId);
  if (error) reportError("panel.carta.categoria.borrar", error, { id: category.id });
  return !error;
};

export const reorderMenuCategories = async (
  branchId: string,
  ordered: MenuCategoryView[],
): Promise<boolean> => {
  const results = await Promise.all(
    ordered.map((c, i) =>
      saveMenuCategory(
        branchId,
        { name: c.name, active: c.active, order: i },
        c.id,
        c.name,
      ),
    ),
  );
  return results.every((r) => r.ok);
};

export const reorderMenuProducts = async (
  branchId: string,
  ordered: MenuProductView[],
): Promise<boolean> => {
  const results = await Promise.all(
    ordered.map((p, i) =>
      saveMenuProduct(
        branchId,
        {
          name: p.name,
          description: p.description ?? undefined,
          category: p.category ?? undefined,
          price: p.price,
          cost: p.cost,
          imageUrl: p.imageUrl ?? undefined,
          active: p.active,
          order: i,
        },
        p.id,
      ),
    ),
  );
  return results.every((r) => r.ok);
};

export const syncMissingCategories = async (
  branchId: string,
  products: MenuProductView[],
  categories: MenuCategoryView[],
): Promise<MenuCategoryView[]> => {
  const have = new Set(categories.map((c) => c.name.trim().toLowerCase()));
  const missing = [
    ...new Set(
      products
        .map((p) => p.category?.trim() ?? "")
        .filter((n) => n.length > 0 && !have.has(n.toLowerCase())),
    ),
  ];
  if (!missing.length) return categories;
  let next = categories;
  let order = categories.reduce((m, c) => Math.max(m, c.order + 1), 0);
  for (const name of missing) {
    const res = await saveMenuCategory(branchId, {
      name,
      active: true,
      order: order++,
    });
    if (res.ok) next = [...next, res.category];
  }
  return next;
};

export const importMenuRows = async (
  branchId: string,
  rows: MenuImportRow[],
  existing: MenuProductView[],
): Promise<{ created: number; skipped: number; failed: number }> => {
  const valid = rows.filter((r) => !r.error && r.price != null);
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let order = existing.reduce((m, p) => Math.max(m, p.order + 1), 0);
  for (const row of valid) {
    const dup = existing.some(
      (p) =>
        sameCat(p.category, row.category || null) &&
        p.name.trim().toLowerCase() === row.name.trim().toLowerCase(),
    );
    if (dup) {
      skipped++;
      continue;
    }
    const res = await saveMenuProduct(branchId, {
      name: row.name,
      description: row.description || undefined,
      category: row.category || undefined,
      price: row.price!,
      cost: row.cost,
      active: true,
      order: order++,
    });
    if (res.ok) {
      created++;
      existing.push(res.product);
    } else {
      failed++;
    }
  }
  return { created, skipped, failed };
};

export const compressMenuImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("not-image"));
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const max = 720;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const quality = [0.72, 0.55, 0.4];
      let data = "";
      for (const q of quality) {
        data = canvas.toDataURL("image/jpeg", q);
        if (data.length <= 180_000) {
          resolve(data);
          return;
        }
      }
      reject(new Error("too-big"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("load"));
    };
    img.src = url;
  });
