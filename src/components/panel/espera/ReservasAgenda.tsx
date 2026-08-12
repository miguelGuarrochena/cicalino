"use client";

import { useMemo, useState } from "react";
import {
  reservationDateKey,
  reservationTime,
  timeUntilLabel,
} from "@/lib/reservations";
import { TZ_NEGOCIO } from "@/lib/businessDay";
import { addDaysKey, pad2 } from "@/lib/espera/slots";
import {
  RESERVATION_STATUS_LABEL,
  tablesTitle,
  type ReservationView,
} from "@/lib/types";

const BTN_MOBILE =
  "w-full rounded-full px-4 py-3.5 text-sm font-semibold transition active:scale-[0.98] sm:w-auto sm:px-4 sm:py-2.5";

const UPCOMING_LIMIT = 8;

type MonthCell = {
  key: string;
  day: number;
  inMonth: boolean;
};

const monthLabel = (year: number, month: number, locale: string) => {
  const loc = locale === "en" ? "en-US" : "es-AR";
  return new Date(year, month - 1, 1).toLocaleDateString(loc, {
    month: "long",
    year: "numeric",
  });
};

const todayKeyInTz = (now = Date.now()) =>
  reservationDateKey(new Date(now).toISOString(), TZ_NEGOCIO);

const shiftMonth = (year: number, month: number, delta: number) => {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
};

/* Monday-first grid with muted prev/next month spillover (clickable). */
const buildMonthCells = (year: number, month: number): MonthCell[] => {
  const first = new Date(year, month - 1, 1);
  const mondayIndex = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const prev = shiftMonth(year, month, -1);
  const daysInPrev = new Date(prev.year, prev.month, 0).getDate();
  const next = shiftMonth(year, month, 1);

  const cells: MonthCell[] = [];
  for (let i = 0; i < mondayIndex; i++) {
    const day = daysInPrev - mondayIndex + 1 + i;
    cells.push({
      key: `${prev.year}-${pad2(prev.month)}-${pad2(day)}`,
      day,
      inMonth: false,
    });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      key: `${year}-${pad2(month)}-${pad2(day)}`,
      day,
      inMonth: true,
    });
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({
      key: `${next.year}-${pad2(next.month)}-${pad2(nextDay)}`,
      day: nextDay,
      inMonth: false,
    });
    nextDay += 1;
  }
  return cells;
};

const dayChipLabel = (key: string, todayKey: string, locale: string) => {
  if (key === todayKey) return locale === "en" ? "Today" : "Hoy";
  if (key === addDaysKey(todayKey, 1))
    return locale === "en" ? "Tomorrow" : "Mañana";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(
    locale === "en" ? "en-US" : "es-AR",
    { weekday: "short", day: "numeric" },
  );
};

export const ReservasAgenda = ({
  reservas,
  locale,
  ahora,
  onSentar,
  onCancelar,
}: {
  reservas: ReservationView[];
  locale: string;
  ahora: number;
  onSentar: (id: string) => void;
  onCancelar: (id: string) => void;
}) => {
  const todayKey = todayKeyInTz(ahora);
  const [cursor, setCursor] = useState(() => {
    const [y, m] = todayKey.split("-").map(Number);
    return { year: y, month: m };
  });
  const [selectedKey, setSelectedKey] = useState(todayKey);

  const byDay = useMemo(() => {
    const map = new Map<string, ReservationView[]>();
    for (const r of reservas) {
      const key = reservationDateKey(r.scheduledAt, TZ_NEGOCIO);
      const list = map.get(key);
      if (list) list.push(r);
      else map.set(key, [r]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    }
    return map;
  }, [reservas]);

  const cells = useMemo(
    () => buildMonthCells(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  );

  const upcoming = useMemo(() => {
    const list = reservas
      .filter(
        (r) => reservationDateKey(r.scheduledAt, TZ_NEGOCIO) >= todayKey,
      )
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    return {
      items: list.slice(0, UPCOMING_LIMIT),
      extra: Math.max(0, list.length - UPCOMING_LIMIT),
    };
  }, [reservas, todayKey]);

  const selectDay = (key: string) => {
    setSelectedKey(key);
    const [y, m] = key.split("-").map(Number);
    if (y !== cursor.year || m !== cursor.month) {
      setCursor({ year: y, month: m });
    }
  };

  /* Month nav only browses the grid — keep the selected day (usually today)
   * until the user explicitly picks another date. */
  const goMonth = (delta: number) => {
    setCursor((c) => shiftMonth(c.year, c.month, delta));
  };

  const delDia = byDay.get(selectedKey) ?? [];
  const selectedLabel = (() => {
    const [y, m, d] = selectedKey.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(
      locale === "en" ? "en-US" : "es-AR",
      { weekday: "long", day: "numeric", month: "long" },
    );
  })();

  const weekdays =
    locale === "en"
      ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      : ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return (
    <div className="flex flex-col gap-4">
      {upcoming.items.length > 0 && (
        <div className="rounded-[20px] border border-amber-400/35 bg-amber-50/40 p-3 shadow-sm dark:bg-amber-400/10 sm:p-4">
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-lg uppercase tracking-tight text-carbon">
              {locale === "en" ? "Upcoming" : "Próximas reservas"}
            </h3>
            <p className="text-xs text-carbon/45">
              {locale === "en"
                ? "Next bookings at a glance"
                : "Lo que viene, de un vistazo"}
            </p>
          </div>
          <ul className="flex flex-col gap-1.5">
            {upcoming.items.map((r) => {
              const key = reservationDateKey(r.scheduledAt, TZ_NEGOCIO);
              const active = key === selectedKey;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => selectDay(key)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                      active
                        ? "bg-amber-500 text-amber-950 shadow-sm"
                        : "bg-surface/80 text-carbon hover:bg-amber-100/70 dark:hover:bg-amber-400/20"
                    }`}
                  >
                    <span
                      className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                        active
                          ? "bg-amber-950/10 text-amber-950"
                          : "bg-amber-200/70 text-amber-950 dark:bg-amber-400/25 dark:text-amber-100"
                      }`}
                    >
                      {dayChipLabel(key, todayKey, locale)}
                    </span>
                    <span className="font-display text-lg tabular-nums tracking-tight">
                      {reservationTime(r.scheduledAt)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {r.name}
                    </span>
                    <span
                      className={`hidden shrink-0 text-xs sm:inline ${
                        active ? "text-amber-950/70" : "text-carbon/50"
                      }`}
                    >
                      {tablesTitle(
                        r.tableNumbers ?? [r.tableNumber],
                        locale === "en" ? "en" : "es",
                      )}{" "}
                      · {r.partySize}{" "}
                      {locale === "en" ? "pax" : "pers."}
                    </span>
                    <span
                      className={`shrink-0 text-xs ${
                        active ? "text-amber-950/70" : "text-carbon/45"
                      }`}
                    >
                      {timeUntilLabel(
                        r.scheduledAt,
                        locale === "en" ? "en" : "es",
                        ahora,
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {upcoming.extra > 0 && (
            <p className="mt-2 text-xs text-carbon/45">
              {locale === "en"
                ? `+${upcoming.extra} more — tap a day on the calendar`
                : `+${upcoming.extra} más — tocá un día en el calendario`}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
        <div className="rounded-[20px] border border-amber-400/35 bg-amber-50/50 p-3 shadow-sm dark:bg-amber-400/10 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => goMonth(-1)}
              className="rounded-full border border-linea bg-surface px-3 py-1.5 text-sm font-semibold text-carbon/70 hover:bg-carbon/5"
              aria-label={locale === "en" ? "Previous month" : "Mes anterior"}
            >
              ‹
            </button>
            <p className="font-display text-lg uppercase tracking-tight text-carbon capitalize">
              {monthLabel(cursor.year, cursor.month, locale)}
            </p>
            <button
              type="button"
              onClick={() => goMonth(1)}
              className="rounded-full border border-linea bg-surface px-3 py-1.5 text-sm font-semibold text-carbon/70 hover:bg-carbon/5"
              aria-label={locale === "en" ? "Next month" : "Mes siguiente"}
            >
              ›
            </button>
          </div>
          <div className="mb-1.5 grid grid-cols-7 gap-1">
            {weekdays.map((w) => (
              <p
                key={w}
                className="text-center text-[10px] font-bold uppercase tracking-wide text-carbon/40"
              >
                {w}
              </p>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => {
              const count = byDay.get(cell.key)?.length ?? 0;
              const selected = cell.key === selectedKey;
              const isToday = cell.key === todayKey;
              const muted = !cell.inMonth;
              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => selectDay(cell.key)}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm font-semibold transition ${
                    selected
                      ? "bg-amber-500 text-amber-950 shadow-sm"
                      : count
                        ? muted
                          ? "bg-amber-100/60 text-amber-900/55 hover:bg-amber-200/70 dark:bg-amber-400/15 dark:text-amber-100/55"
                          : "bg-amber-200/70 text-amber-950 hover:bg-amber-300/80 dark:bg-amber-400/25 dark:text-amber-100"
                        : muted
                          ? "bg-transparent text-carbon/30 hover:bg-carbon/5"
                          : "bg-surface text-carbon/70 hover:bg-carbon/5"
                  } ${isToday && !selected ? "ring-2 ring-espera/50" : ""}`}
                >
                  {cell.day}
                  {count > 0 && (
                    <span
                      className={`mt-0.5 text-[9px] font-bold leading-none ${
                        selected
                          ? "text-amber-950/80"
                          : muted
                            ? "text-amber-800/50 dark:text-amber-200/50"
                            : "text-amber-800 dark:text-amber-200"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-carbon/50">
            {locale === "en"
              ? "Neighboring days are faded. Tap a day — or an upcoming row — to see the list."
              : "Los días del mes vecino se ven atenuados. Tocá un día — o una próxima — para ver la lista."}
          </p>
        </div>

        <div className="min-w-0">
          <div className="mb-3">
            <h3 className="font-display text-xl uppercase tracking-tight text-carbon capitalize">
              {selectedLabel}
            </h3>
            <p className="text-xs text-carbon/50">
              {delDia.length
                ? locale === "en"
                  ? `${delDia.length} booking${delDia.length === 1 ? "" : "s"}`
                  : `${delDia.length} reserva${delDia.length === 1 ? "" : "s"}`
                : locale === "en"
                  ? "No bookings this day"
                  : "Sin reservas este día"}
            </p>
          </div>
          {delDia.length ? (
            <div className="flex flex-col gap-3">
              {delDia.map((r) => (
                <article
                  key={r.id}
                  className="rounded-[20px] border border-amber-400/40 bg-amber-50/80 p-4 shadow-sm dark:bg-amber-400/10"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display text-2xl tabular-nums tracking-tight text-amber-950 dark:text-amber-100">
                          {reservationTime(r.scheduledAt)}
                        </p>
                        <h3 className="font-display text-xl uppercase tracking-tight text-carbon">
                          {r.name}
                        </h3>
                        <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950 dark:bg-amber-400/30 dark:text-amber-100">
                          {RESERVATION_STATUS_LABEL[r.status]}
                        </span>
                        <span className="rounded-full bg-carbon/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-carbon/70">
                          {tablesTitle(
                            r.tableNumbers ?? [r.tableNumber],
                            locale === "en" ? "en" : "es",
                          )}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-carbon/55">
                        {r.partySize}{" "}
                        {locale === "en" ? "guests" : "personas"} · +
                        {r.graceMinutes} min ·{" "}
                        {timeUntilLabel(
                          r.scheduledAt,
                          locale === "en" ? "en" : "es",
                          ahora,
                        )}
                        {r.employee ? ` · ${r.employee}` : ""}
                      </p>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
                      <button
                        type="button"
                        onClick={() => onSentar(r.id)}
                        className={`${BTN_MOBILE} bg-carbon text-crema hover:opacity-90`}
                      >
                        {locale === "en" ? "Seat" : "Sentar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onCancelar(r.id)}
                        className={`${BTN_MOBILE} text-red-600/80 hover:bg-red-50`}
                      >
                        {locale === "en" ? "Cancel" : "Cancelar"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-linea bg-surface px-4 py-8 text-center text-sm text-carbon/45">
              {locale === "en"
                ? "Nothing booked this day."
                : "No hay reservas este día."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
