"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listarCobrosPendientes,
  revisarCobrosAlAbrirAdmin,
} from "@/lib/actions/cobros";

type Item = { id: string; nombre: string; motivo: string; email: string };

/** Avisos de cobro / fin de prueba en el panel de Superadmin. */
export const CobrosPanel = ({
  onAbrir,
}: {
  onAbrir?: (orgId: string) => void;
}) => {
  const [items, setItems] = useState<Item[]>([]);

  const load = useCallback(async () => {
    setItems(await listarCobrosPendientes());
  }, []);

  useEffect(() => {
    void load();
    // Mail diario (anti-spam adentro de la action).
    void revisarCobrosAlAbrirAdmin();
  }, [load]);

  if (items.length === 0) return null;

  return (
    <section className="rounded-[24px] border border-amber-400/40 bg-amber-50 p-4 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-100">
        Cobros a revisar
        <span className="rounded-full bg-amber-600 px-2 py-0.5 text-xs text-white">
          {items.length}
        </span>
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((o) => (
          <li
            key={o.id}
            className="flex flex-col gap-2 rounded-2xl border border-amber-200/80 bg-surface px-3 py-3 sm:flex-row sm:items-center dark:border-amber-500/20"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-carbon">{o.nombre}</p>
              <p className="truncate text-xs text-carbon/55">
                {o.motivo} · {o.email}
              </p>
            </div>
            {onAbrir && (
              <button
                type="button"
                onClick={() => onAbrir(o.id)}
                className="shrink-0 rounded-full bg-carbon px-3 py-1.5 text-xs font-semibold text-crema"
              >
                Ver
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};
