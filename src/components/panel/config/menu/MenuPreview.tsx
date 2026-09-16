"use client";

import { formatMoney } from "@/lib/tableBill";
import type { MenuCategoryView, MenuProductView } from "@/lib/data/menu";

export const MenuPreview = ({
  title,
  empty,
  uncategorized,
  categories,
  products,
}: {
  title: string;
  empty: string;
  uncategorized: string;
  categories: MenuCategoryView[];
  products: MenuProductView[];
}) => {
  const visible = products.filter((p) => p.active);
  const hiddenCats = new Set(
    categories.filter((c) => !c.active).map((c) => c.name.trim().toLowerCase()),
  );
  const guest = visible.filter((p) => {
    const cat = p.category?.trim().toLowerCase() ?? "";
    return !cat || !hiddenCats.has(cat);
  });
  const groups: { name: string; items: MenuProductView[] }[] = [];
  for (const c of [...categories].sort((a, b) => a.order - b.order)) {
    if (!c.active) continue;
    const items = guest
      .filter((p) => (p.category?.trim().toLowerCase() ?? "") === c.name.trim().toLowerCase())
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    if (items.length) groups.push({ name: c.name, items });
  }
  const loose = guest
    .filter((p) => !p.category?.trim())
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  if (loose.length) groups.push({ name: uncategorized, items: loose });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-linea bg-surface">
      <div className="border-b border-linea px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon/45">
          {title}
        </p>
      </div>
      <div className="u-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!guest.length && (
          <p className="py-8 text-center text-sm text-carbon/55">{empty}</p>
        )}
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <section key={g.name}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-carbon/50">
                {g.name}
              </h3>
              <ul className="flex flex-col gap-2">
                {g.items.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 rounded-2xl border border-linea bg-crema/40 p-3"
                  >
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imageUrl}
                        alt=""
                        className="size-12 shrink-0 rounded-xl object-cover"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-carbon">{p.name}</p>
                      {p.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-carbon/55">
                          {p.description}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-marca">
                      {formatMoney(p.price)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};
