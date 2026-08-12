"use client";

import { useApp } from "@/components/providers/Providers";

/** Decorative staff-panel mock for the Espera FAQ tab — not interactive. */
const WEEKDAYS_ES = ["L", "M", "X", "J", "V", "S", "D"];
const WEEKDAYS_EN = ["M", "T", "W", "T", "F", "S", "S"];

/* Fixed “August 2026” style grid: leading muted spillover + a few booked days. */
const CELLS: { day: number; muted?: boolean; count?: number; today?: boolean }[] =
  [
    { day: 27, muted: true },
    { day: 28, muted: true },
    { day: 29, muted: true },
    { day: 30, muted: true },
    { day: 31, muted: true, count: 1 },
    { day: 1, today: true, count: 2 },
    { day: 2, count: 1 },
    { day: 3 },
    { day: 4, count: 3 },
    { day: 5 },
    { day: 6 },
    { day: 7, count: 1 },
    { day: 8 },
    { day: 9 },
  ];

const UPCOMING = [
  { dayKey: "hoy", time: "13:00", name: "García", meta: "Mesa 4 · 2" },
  { dayKey: "hoy", time: "21:30", name: "López", meta: "Mesa 7 · 4" },
  { dayKey: "manana", time: "20:00", name: "Ruiz", meta: "Mesa 2 · 3" },
] as const;

export const ReservasLandingPreview = () => {
  const { locale, t } = useApp();
  const weekdays = locale === "en" ? WEEKDAYS_EN : WEEKDAYS_ES;
  const dayLabel = (key: "hoy" | "manana") =>
    key === "hoy"
      ? locale === "en"
        ? "Today"
        : "Hoy"
      : locale === "en"
        ? "Tomorrow"
        : "Mañana";

  return (
    <section
      className="mt-8 overflow-hidden rounded-[28px] border border-amber-400/35 bg-amber-50/40 p-5 shadow-sm dark:bg-amber-400/10 sm:p-6"
      aria-label={t("faq.e.reservasTitulo")}
    >
      <div className="mb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-800/70 dark:text-amber-200/70">
          {t("faq.e.reservasKicker")}
        </p>
        <h3 className="mt-1 font-display text-xl uppercase tracking-tight text-carbon sm:text-2xl">
          {t("faq.e.reservasTitulo")}
        </h3>
        <p className="mt-1.5 max-w-xl text-sm text-carbon/60">
          {t("faq.e.reservasSub")}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start">
        <div className="rounded-[20px] border border-amber-400/30 bg-surface/80 p-3 sm:p-4">
          <p className="mb-3 text-center font-display text-base uppercase tracking-tight text-carbon">
            {locale === "en" ? "August 2026" : "Agosto 2026"}
          </p>
          <div className="mb-1.5 grid grid-cols-7 gap-1">
            {weekdays.map((w, i) => (
              <p
                key={`${w}-${i}`}
                className="text-center text-[10px] font-bold uppercase tracking-wide text-carbon/40"
              >
                {w}
              </p>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {CELLS.map((cell, i) => (
              <div
                key={`${cell.day}-${i}`}
                className={`flex aspect-square flex-col items-center justify-center rounded-xl text-sm font-semibold ${
                  cell.today
                    ? "bg-amber-500 text-amber-950 shadow-sm"
                    : cell.count
                      ? cell.muted
                        ? "bg-amber-100/60 text-amber-900/50"
                        : "bg-amber-200/70 text-amber-950"
                      : cell.muted
                        ? "text-carbon/30"
                        : "bg-surface text-carbon/70"
                }`}
              >
                {cell.day}
                {cell.count ? (
                  <span
                    className={`mt-0.5 text-[9px] font-bold leading-none ${
                      cell.today
                        ? "text-amber-950/80"
                        : cell.muted
                          ? "text-amber-800/45"
                          : "text-amber-800"
                    }`}
                  >
                    {cell.count}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <p className="mb-2 font-display text-lg uppercase tracking-tight text-carbon">
            {t("faq.e.reservasProximas")}
          </p>
          <ul className="flex flex-col gap-1.5">
            {UPCOMING.map((r) => (
              <li
                key={`${r.dayKey}-${r.time}-${r.name}`}
                className="flex items-center gap-2.5 rounded-xl bg-surface/90 px-3 py-2.5"
              >
                <span className="shrink-0 rounded-lg bg-amber-200/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                  {dayLabel(r.dayKey)}
                </span>
                <span className="font-display text-lg tabular-nums tracking-tight text-carbon">
                  {r.time}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold text-carbon">
                  {r.name}
                </span>
                <span className="hidden shrink-0 text-xs text-carbon/45 sm:inline">
                  {r.meta}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-carbon/50">
            {t("faq.e.reservasNota")}
          </p>
        </div>
      </div>
    </section>
  );
};
