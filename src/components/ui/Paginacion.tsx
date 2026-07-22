"use client";

import { useApp } from "@/components/providers/Providers";

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export const Paginacion = ({ page, pageSize, total, onChange }: Props) => {
  const { t } = useApp();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-linea pt-3">
      <p className="text-xs text-carbon/50">
        {t("paginacion.rango", { from, to, total })}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="rounded-full border border-linea px-3 py-1.5 text-xs font-semibold text-carbon transition enabled:hover:bg-carbon/5 disabled:opacity-35"
        >
          {t("paginacion.prev")}
        </button>
        <span className="min-w-[3.5rem] text-center text-xs font-semibold text-carbon/60">
          {page}/{pages}
        </span>
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          className="rounded-full border border-linea px-3 py-1.5 text-xs font-semibold text-carbon transition enabled:hover:bg-carbon/5 disabled:opacity-35"
        >
          {t("paginacion.next")}
        </button>
      </div>
    </div>
  );
};

export const slicePage = <T,>(items: T[], page: number, pageSize: number): T[] => {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
};
