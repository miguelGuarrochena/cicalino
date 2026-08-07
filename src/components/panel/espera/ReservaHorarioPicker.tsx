"use client";

/* Extraído de app/(app)/panel/espera/page.tsx. Movido tal cual. */

import { useEffect, useMemo } from "react";
import {
  availableTimeSlots,
  buildDayOptions,
  combineLocalHorario,
  dateKeyFromLocal,
  timeKeyFromLocal,
  todayDateKey,
} from "@/lib/espera/slots";

export const ReservaHorarioPicker = ({
  value,
  onChange,
  locale,
}: {
  value: string;
  onChange: (v: string) => void;
  locale: string;
}) => {
  const days = useMemo(() => buildDayOptions(locale), [locale]);
  const dateKey = dateKeyFromLocal(value) || todayDateKey();
  const timeKey = timeKeyFromLocal(value) || "20:00";
  const slots = useMemo(() => availableTimeSlots(dateKey), [dateKey]);

  useEffect(() => {
    if (!slots.length) return;
    if (!slots.includes(timeKey)) {
      onChange(combineLocalHorario(dateKey, slots[0]));
    }
  }, [dateKey, timeKey, slots, onChange]);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-linea bg-crema/30 p-3">
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-carbon/45">
          {locale === "en" ? "Day" : "Día"}
        </p>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {days.map((d) => {
            const active = d.key === dateKey;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => {
                  const nextSlots = availableTimeSlots(d.key);
                  const t = nextSlots.includes(timeKey)
                    ? timeKey
                    : (nextSlots[0] ?? timeKey);
                  onChange(combineLocalHorario(d.key, t));
                }}
                className={`flex min-h-11 shrink-0 items-center justify-center rounded-full px-4 text-sm font-semibold capitalize transition sm:min-h-0 sm:px-3.5 sm:py-2 ${
                  active
                    ? "bg-espera text-crema"
                    : "border border-linea bg-surface text-carbon/70 hover:bg-carbon/5"
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-carbon/45">
          {locale === "en" ? "Time · every 15 min" : "Hora · cada 15 min"}
        </p>
        {slots.length ? (
          <div className="grid max-h-44 grid-cols-4 gap-1.5 overflow-y-auto rounded-xl sm:grid-cols-5">
            {slots.map((t) => {
              const active = t === timeKey;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onChange(combineLocalHorario(dateKey, t))}
                  className={`rounded-xl px-2 py-2.5 text-sm font-semibold tabular-nums transition active:scale-95 ${
                    active
                      ? "bg-espera text-crema shadow-sm"
                      : "border border-linea bg-surface text-carbon hover:border-espera/40"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl border border-linea bg-surface px-3 py-3 text-sm text-carbon/55">
            {locale === "en"
              ? "No more slots today — pick another day."
              : "No quedan horarios hoy, elegí otro día."}
          </p>
        )}
      </div>
    </div>
  );
};
