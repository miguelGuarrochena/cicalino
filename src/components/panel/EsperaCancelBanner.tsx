"use client";

import Link from "next/link";
import { useEsperaAlertsStore } from "@/lib/store/espera-alerts-store";
import { useApp } from "@/components/providers/Providers";
import { useEsperaCancelWatch } from "@/lib/hooks/useEsperaCancelWatch";

/** Escucha cancelaciones + banner sticky en todo el panel. */
export const EsperaCancelBanner = () => {
  useEsperaCancelWatch();
  const { locale } = useApp();
  const alerts = useEsperaAlertsStore((s) => s.alerts);
  const dismiss = useEsperaAlertsStore((s) => s.dismiss);
  const dismissAll = useEsperaAlertsStore((s) => s.dismissAll);

  const guests = alerts.filter((a) => a.fromGuest);
  if (!guests.length) return null;

  return (
    <div className="border-b border-rose-300/60 bg-rose-50 text-rose-950 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-2.5 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-wide">
            {locale === "en"
              ? "Guest cancelled wait"
              : "Cliente canceló la espera"}
          </p>
          <button
            type="button"
            onClick={dismissAll}
            className="shrink-0 text-xs font-semibold underline-offset-2 hover:underline"
          >
            {locale === "en" ? "Dismiss all" : "Cerrar avisos"}
          </button>
        </div>
        <ul className="flex flex-col gap-1.5">
          {guests.slice(0, 4).map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span className="font-semibold">{a.nombre}</span>
              <div className="flex items-center gap-2">
                <Link
                  href="/panel/espera"
                  className="rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white"
                >
                  {locale === "en" ? "Open floor" : "Ver sala"}
                </Link>
                <button
                  type="button"
                  onClick={() => dismiss(a.id)}
                  className="text-xs font-semibold opacity-70 hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
