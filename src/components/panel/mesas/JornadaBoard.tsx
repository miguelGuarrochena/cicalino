"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useToast } from "@/components/ui/Toast";
import { Select } from "@/components/ui/Select";
import type { EmployeeUI } from "@/lib/store/config-store";
import {
  WEEKDAYS,
  assignmentByTable,
  formatTableRange,
  rangesOverlap,
  staffOnShift,
  unassignedTables,
  type ShiftDay,
} from "@/lib/floorShift";
import {
  applyShiftTemplate,
  assignTable,
  assignTableRange,
  saveShiftTemplate,
} from "@/lib/data/floorShift";

const INPUT =
  "min-h-11 w-20 rounded-xl border border-linea bg-crema/40 px-3 text-sm tabular-nums text-carbon outline-none focus:border-marca focus:ring-2 focus:ring-marca/20";

type DraftRange = { employeeId: string; from: string; to: string };

export const JornadaBoard = ({
  branchId,
  shift,
  live,
  tableCount,
  occupied,
  employees,
  canManage,
  actorId,
  onChanged,
}: {
  branchId: string | null;
  shift: ShiftDay;
  live: boolean;
  tableCount: number;
  occupied: Set<number>;
  employees: EmployeeUI[];
  canManage: boolean;
  actorId: string | null;
  onChanged: () => void;
}) => {
  const { t, locale } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState(String(Math.min(6, Math.max(1, tableCount || 1))));
  const [rangeEmp, setRangeEmp] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const [pickEmp, setPickEmp] = useState("");
  const [diaOverride, setDiaOverride] = useState<number | null>(null);
  const [draftsByDay, setDraftsByDay] = useState<Partial<Record<number, DraftRange[]>>>({});
  /* Weekdays are ISO 1..7; 0 only means the shift hasn't loaded yet. */
  const dia = diaOverride ?? (shift.weekday || 1);
  const templateDrafts = shift.template
    .filter((p) => p.weekday === dia)
    .map((p) => ({
      employeeId: p.employeeId,
      from: String(p.from),
      to: String(p.to),
    }));
  const drafts = draftsByDay[dia] ?? templateDrafts;
  const setDrafts = (next: DraftRange[] | ((rows: DraftRange[]) => DraftRange[])) =>
    setDraftsByDay((prev) => ({
      ...prev,
      [dia]: typeof next === "function" ? next(drafts) : next,
    }));
  const empId = rangeEmp || employees[0]?.id || "";

  const byTable = useMemo(() => assignmentByTable(shift.assignments), [shift.assignments]);
  const staff = useMemo(() => staffOnShift(shift.assignments), [shift.assignments]);
  const libres = useMemo(
    () => unassignedTables(tableCount, shift.assignments),
    [tableCount, shift.assignments],
  );
  const ocupadasN = [...occupied].length;

  const reasonText = (reason?: string) => {
    const k = `recepcion.error.${reason ?? "error"}`;
    const txt = t(k);
    return txt === k ? t("recepcion.error.error") : txt;
  };

  const run = async (id: string, fn: () => Promise<{ ok: boolean; reason?: string }>, okMsg: string) => {
    if (!branchId || !live) {
      toast(t("recepcion.conectar"), "error");
      return;
    }
    setBusy(id);
    const res = await fn();
    setBusy(null);
    if (res.ok) {
      toast(okMsg, "success");
      onChanged();
    } else {
      toast(reasonText(res.reason), "error");
    }
  };

  const fecha = shift.date
    ? new Date(`${shift.date}T12:00:00`).toLocaleDateString(locale === "en" ? "en-GB" : "es-AR", {
        day: "2-digit",
        month: "2-digit",
      })
    : "";

  const assignOne = (mesa: number, employeeId: string | null) =>
    run(
      `m-${mesa}`,
      () => assignTable(branchId!, mesa, employeeId, actorId),
      t("recepcion.asignado"),
    );

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[24px] border border-marca/20 bg-surface p-4 shadow-sm sm:p-5">
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-marca">
              {t("recepcion.jornadaHoy")}
            </p>
            <h2 className="font-display text-2xl uppercase tracking-tight text-carbon">
              {t(`recepcion.dia.${shift.weekday || dia}`)}
              {fecha ? ` — ${fecha}` : ""}
            </h2>
          </div>
        </header>

        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-carbon/55">
          <span className="rounded-full bg-marca/10 px-2.5 py-1 text-marca">
            {staff.length} {t("recepcion.enTurno")}
          </span>
          <span className="rounded-full bg-carbon/5 px-2.5 py-1">
            {libres.length} {t("recepcion.mesasLibres")}
          </span>
          <span className="rounded-full bg-carbon/5 px-2.5 py-1">
            {ocupadasN} {t("recepcion.ocupadas")}
          </span>
        </div>

        {!employees.length ? (
          <p className="mt-4 text-sm text-carbon/55">{t("recepcion.sinEmpleados")}</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {staff.map((s) => (
              <li
                key={s.id}
                className="rounded-2xl border border-linea bg-crema/30 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-carbon">{s.name}</p>
                  <p className="text-sm tabular-nums text-carbon/70">
                    {formatTableRange(s.tables)}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.tables.map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={busy != null}
                      onClick={() => {
                        setPicked(n);
                        setPickEmp(s.id);
                      }}
                      className={`min-h-9 min-w-9 rounded-lg px-2 text-xs font-semibold tabular-nums ${
                        occupied.has(n)
                          ? "bg-rose-600 text-crema"
                          : picked === n
                            ? "bg-marca text-crema"
                            : "bg-surface text-carbon ring-1 ring-linea"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}

        {libres.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-carbon/50">
              {t("recepcion.mesasLibres")}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {libres.map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={busy != null}
                  onClick={() => {
                    setPicked(n);
                    setPickEmp(canManage ? empId : actorId ?? "");
                  }}
                  className={`min-h-9 min-w-9 rounded-lg px-2 text-xs font-semibold tabular-nums ${
                    occupied.has(n)
                      ? "bg-rose-600 text-crema"
                      : picked === n
                        ? "bg-marca text-crema"
                        : "bg-surface text-carbon/70 ring-1 ring-dashed ring-linea"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {picked != null && (
          <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-marca/25 bg-marca/5 p-3 sm:flex-row sm:items-center">
            <p className="text-sm font-semibold text-carbon">
              {t("mesa.mesaN", { n: picked })}
              {byTable.get(picked)?.employeeName
                ? ` · ${byTable.get(picked)?.employeeName}`
                : ` · ${t("recepcion.sinAsignar")}`}
              {occupied.has(picked) ? ` · ${t("recepcion.ocupada")}` : ""}
            </p>
            {canManage ? (
              <>
                <Select
                  value={pickEmp}
                  onChange={setPickEmp}
                  className="flex-1"
                  triggerClassName="min-h-11"
                  ariaLabel={t("recepcion.asignar")}
                  options={[
                    { value: "", label: t("recepcion.sinAsignar") },
                    ...employees.map((e) => ({ value: e.id, label: e.name })),
                  ]}
                />
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => {
                    const mesa = picked;
                    setPicked(null);
                    void assignOne(mesa, pickEmp || null);
                  }}
                  className="min-h-11 rounded-full bg-marca px-4 text-sm font-semibold text-crema disabled:opacity-50"
                >
                  {t("recepcion.asignar")}
                </button>
              </>
            ) : actorId && !byTable.get(picked)?.employeeId ? (
              <button
                type="button"
                disabled={busy != null}
                onClick={() => {
                  const mesa = picked;
                  setPicked(null);
                  void assignOne(mesa, actorId);
                }}
                className="min-h-11 rounded-full bg-marca px-4 text-sm font-semibold text-crema disabled:opacity-50"
              >
                {t("recepcion.tomar")}
              </button>
            ) : null}
          </div>
        )}

        {canManage && employees.length > 0 && (
          <form
            className="mt-5 border-t border-linea pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              const a = Number(from);
              const b = Number(to);
              if (!empId || !Number.isInteger(a) || !Number.isInteger(b)) return;
              void run(
                "rango",
                () => assignTableRange(branchId!, a, b, empId, actorId),
                t("recepcion.asignado"),
              );
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-carbon/50">
              {t("recepcion.asignarRango")}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="text-xs text-carbon/55">
                {t("recepcion.desde")}
                <input
                  type="number"
                  min={1}
                  max={tableCount || undefined}
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className={`${INPUT} ml-1`}
                />
              </label>
              <label className="text-xs text-carbon/55">
                {t("recepcion.hasta")}
                <input
                  type="number"
                  min={1}
                  max={tableCount || undefined}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className={`${INPUT} ml-1`}
                />
              </label>
              <Select
                value={empId}
                onChange={setRangeEmp}
                className="min-w-[10rem] flex-1"
                triggerClassName="min-h-11"
                ariaLabel={t("recepcion.asignar")}
                options={employees.map((e) => ({ value: e.id, label: e.name }))}
              />
              <button
                type="submit"
                disabled={busy != null || !empId}
                className="min-h-11 rounded-full bg-marca px-4 text-sm font-semibold text-crema disabled:opacity-50"
              >
                {t("recepcion.asignar")}
              </button>
              <button
                type="button"
                disabled={busy != null}
                onClick={() => {
                  const a = Number(from);
                  const b = Number(to);
                  if (!Number.isInteger(a) || !Number.isInteger(b)) return;
                  void run(
                    "quitar",
                    () => assignTableRange(branchId!, a, b, null, actorId),
                    t("recepcion.asignado"),
                  );
                }}
                className="min-h-11 rounded-full border border-linea px-4 text-sm font-semibold text-carbon/70 disabled:opacity-50"
              >
                {t("recepcion.quitar")}
              </button>
            </div>
          </form>
        )}

        {canManage && (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
            <button
              type="button"
              disabled={busy != null}
              onClick={() =>
                void run("fill", () => applyShiftTemplate(branchId!, false), t("recepcion.hoyCompletado"))
              }
              className="min-h-10 text-sm font-semibold text-marca underline-offset-4 hover:underline disabled:opacity-50"
            >
              {t("recepcion.aplicarHoy")}
            </button>
            <button
              type="button"
              disabled={busy != null}
              onClick={() => {
                if (!window.confirm(t("recepcion.resetHoyConfirmar"))) return;
                void run("reset", () => applyShiftTemplate(branchId!, true), t("recepcion.hoyReemplazado"));
              }}
              className="min-h-10 text-sm font-semibold text-carbon/55 underline-offset-4 hover:underline disabled:opacity-50"
            >
              {t("recepcion.resetHoy")}
            </button>
          </div>
        )}
      </section>

      {canManage && (
        <section className="rounded-[24px] border border-linea bg-surface p-4 shadow-sm sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-marca">
            {t("recepcion.plantilla")}
          </p>
          <h3 className="font-display text-xl uppercase tracking-tight text-carbon">
            {t("recepcion.plantilla")}
          </h3>
          <p className="mt-1 text-sm text-carbon/55">{t("recepcion.plantillaSub")}</p>

          {/* Wrapped, not scrolled: with the bill open the row is narrow and
              Sunday used to sit off-screen with nothing saying so. */}
          <div className="mt-3 flex flex-wrap gap-1">
            {WEEKDAYS.map((d) => {
              const active = dia === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDiaOverride(d)}
                  className={`min-h-10 shrink-0 rounded-full px-3 text-xs font-semibold ${
                    active ? "bg-marca text-crema" : "border border-linea text-carbon/60"
                  }`}
                >
                  {t(`recepcion.dia.${d}`)}
                </button>
              );
            })}
          </div>

          <ul className="mt-3 flex flex-col gap-2">
            {drafts.map((row, i) => (
              <li key={`${row.employeeId}-${i}`} className="flex flex-wrap items-center gap-2">
                <Select
                  value={row.employeeId}
                  onChange={(employeeId) =>
                    setDrafts((rows) =>
                      rows.map((r, j) => (j === i ? { ...r, employeeId } : r)),
                    )
                  }
                  className="min-w-[10rem] flex-1"
                  triggerClassName="min-h-11"
                  ariaLabel={t("recepcion.asignar")}
                  options={employees.map((emp) => ({ value: emp.id, label: emp.name }))}
                />
                <input
                  type="number"
                  min={1}
                  value={row.from}
                  onChange={(e) =>
                    setDrafts((rows) =>
                      rows.map((r, j) => (j === i ? { ...r, from: e.target.value } : r)),
                    )
                  }
                  className={INPUT}
                />
                <span className="text-carbon/40">–</span>
                <input
                  type="number"
                  min={1}
                  value={row.to}
                  onChange={(e) =>
                    setDrafts((rows) =>
                      rows.map((r, j) => (j === i ? { ...r, to: e.target.value } : r)),
                    )
                  }
                  className={INPUT}
                />
                <button
                  type="button"
                  onClick={() => setDrafts((rows) => rows.filter((_, j) => j !== i))}
                  className="min-h-11 text-sm font-semibold text-carbon/50 underline-offset-4 hover:underline"
                >
                  {t("recepcion.quitar")}
                </button>
              </li>
            ))}
          </ul>

          {!drafts.length && (
            <p className="mt-3 text-sm text-carbon/50">{t("recepcion.sinPlantilla")}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setDrafts((rows) => [
                  ...rows,
                  {
                    employeeId: employees[0]?.id ?? "",
                    from: "1",
                    to: String(Math.min(6, tableCount || 1)),
                  },
                ])
              }
              className="min-h-11 rounded-full border border-marca/40 px-4 text-sm font-semibold text-marca"
            >
              {t("recepcion.agregarRango")}
            </button>
            <button
              type="button"
              disabled={busy != null || !employees.length}
              onClick={() => {
                const rows = drafts
                  .map((r) => ({
                    employeeId: r.employeeId,
                    from: Number(r.from),
                    to: Number(r.to),
                  }))
                  .filter((r) => r.employeeId && r.from >= 1 && r.to >= r.from);
                if (rangesOverlap(rows)) {
                  toast(t("recepcion.error.solape"), "error");
                  return;
                }
                void run(
                  "plantilla",
                  async () => {
                    const res = await saveShiftTemplate(branchId!, dia, rows);
                    if (res.ok) {
                      setDraftsByDay((p) => {
                        const n = { ...p };
                        delete n[dia];
                        return n;
                      });
                    }
                    return res;
                  },
                  t("recepcion.plantillaGuardada"),
                );
              }}
              className="min-h-11 rounded-full bg-marca px-4 text-sm font-semibold text-crema disabled:opacity-50"
            >
              {t("recepcion.guardarDia")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
