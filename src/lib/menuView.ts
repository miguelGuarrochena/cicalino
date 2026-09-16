/* How the menu is shown to a guest, in one place so the owner's "Ver menú"
 * preview and the table screen can't drift apart.
 *
 * - Unavailable products and hidden categories are left out.
 * - Categories follow their configured order; products follow theirs.
 * - Products without a category go last, under a generic heading. */

type Cat = { name: string; active: boolean; order: number };
type Prod = {
  id: string;
  name: string;
  category: string | null;
  active?: boolean;
  order?: number;
};

export const categoryKey = (name: string | null | undefined): string =>
  (name ?? "").trim().toLowerCase();

export interface MenuGroup<P> {
  key: string;
  name: string;
  items: P[];
}

export const guestMenuGroups = <P extends Prod>(
  categories: Cat[],
  products: P[],
  uncategorizedLabel: string,
): MenuGroup<P>[] => {
  const byOrder = (a: P, b: P) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name);
  const available = products.filter((p) => p.active !== false);
  const known = new Set(categories.map((c) => categoryKey(c.name)));
  const groups: MenuGroup<P>[] = [];

  for (const c of [...categories].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))) {
    if (!c.active) continue;
    const key = categoryKey(c.name);
    const items = available.filter((p) => categoryKey(p.category) === key).sort(byOrder);
    if (items.length) groups.push({ key, name: c.name, items });
  }

  /* A product whose category name has no row yet (older data) still shows up,
   * under its own name, after the configured ones. */
  const orphanNames = [
    ...new Set(
      available
        .map((p) => p.category?.trim() ?? "")
        .filter((n) => n && !known.has(categoryKey(n))),
    ),
  ];
  for (const name of orphanNames) {
    const key = categoryKey(name);
    groups.push({ key, name, items: available.filter((p) => categoryKey(p.category) === key).sort(byOrder) });
  }

  const loose = available.filter((p) => !p.category?.trim()).sort(byOrder);
  if (loose.length) groups.push({ key: "__sin-categoria__", name: uncategorizedLabel, items: loose });
  return groups;
};

/* Guest-facing order as a flat list: category order first, then product
 * order. The table screen groups consecutive categories, so feeding it this
 * order is enough for both screens to match. */
export const orderForGuests = <P extends Prod>(
  categories: Cat[],
  products: P[],
): P[] => guestMenuGroups(categories, products, "").flatMap((g) => g.items);
