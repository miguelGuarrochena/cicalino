"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useToast } from "@/components/ui/Toast";
import { Select } from "@/components/ui/Select";
import type { EmployeeUI } from "@/lib/store/config-store";
import {
  WEEKDAYS,
  assignmentByTable,
  compactRanges,
  firstName,
  formatTableRange,
  nextFreeRange,
  rangesOverlap,
  staffOnShift,
  tablesInRange,
  unassignedTables,
  type ShiftDay,
} from "@/lib/floorShift";
import {
  applyShiftTemplate,
  assignTable,
  assignTableRange,
  saveShiftTemplate,
} from "@/lib/data/floorShift";

const BTN =
  "min-h-11 w-full rounded-full px-4 text-sm font-semibold disabled:opacity-50 sm:w-auto";
const MESAS =
  "grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8";
const CHIP =
  "flex aspect-square w-full flex-col items-center justify-center rounded-2xl text-base font-semibold tabular-nums";
const EMP_TONE = [
  "bg-marca text-crema",
  "bg-espera text-crema",
  "bg-curso text-crema",
  "bg-carbon text-crema",
  "bg-alerta text-crema",
];

type DraftRange = { employeeId: string; from: string; to: string };

const allMesas = (count: number) =>
  Array.from({ length: Math.max(0, count) }, (_, i) => i + 1);

const toneFor = (employeeId: string | null | undefined, ids: string[]) => {
  if (!employeeId) {
    return "bg-surface text-carbon/65 ring-1 ring-dashed ring-linea";
  }
  const i = Math.max(0, ids.indexOf(employeeId));
  return EMP_TONE[i % EMP_TONE.length];
};

const parseRange = (from: string, to: string) => {
  const a = Number(from);
  const b = Number(to);
  return { a, b, tables: tablesInRange(a, b) };
};

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
  const mesas = useMemo(() => allMesas(tableCount), [tableCount]);
  const mesaOpts = useMemo(
    () => mesas.map((n) => ({ value: String(n), label: String(n) })),
    [mesas],
  );
  const empIds = useMemo(() => employees.map((e) => e.id), [employees]);
  const empName = (id: string) =>
    employees.find((e) => e.id === id)?.name ?? "";

  const byTable = useMemo(
    () => assignmentByTable(shift.assignments),
    [shift.assignments],
  );
  const staff = useMemo(
    () => staffOnShift(shift.assignments),
    [shift.assignments],
  );
  const libres = useMemo(
    () => unassignedTables(tableCount, shift.assignments),
    [tableCount, shift.assignments],
  );
  const ocupadasN = [...occupied].length;
  const takenToday = useMemo(
    () =>
      compactRanges(
        shift.assignments
          .filter((a) => a.employeeId)
          .map((a) => a.tableNumber),
      ),
    [shift.assignments],
  );
  const freeToday = useMemo(
    () => nextFreeRange(tableCount, takenToday),
    [tableCount, takenToday],
  );

  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [rangeEmp, setRangeEmp] = useState("");
  const fromVal = from ?? String(freeToday?.from ?? mesas[0] ?? 1);
  const toVal = to ?? String(freeToday?.to ?? mesas[0] ?? 1);
  const [picked, setPicked] = useState<number | null>(null);
  const [pickEmp, setPickEmp] = useState("");
  const [diaOverride, setDiaOverride] = useState<number | null>(null);
  const [draftsByDay, setDraftsByDay] = useState<
    Partial<Record<number, DraftRange[]>>
  >({});
  const dia = diaOverride ?? (shift.weekday || 1);
  const templateDrafts = shift.template
    .filter((p) => p.weekday === dia)
    .map((p) => ({
      employeeId: p.employeeId,
      from: String(p.from),
      to: String(p.to),
    }));
  const drafts = draftsByDay[dia] ?? templateDrafts;
  const setDrafts = (
    next: DraftRange[] | ((rows: DraftRange[]) => DraftRange[]),
  ) =>
    setDraftsByDay((prev) => ({
      ...prev,
      [dia]: typeof next === "function" ? next(drafts) : next,
    }));
  const empId = rangeEmp || employees[0]?.id || "";
  const rangePreview = parseRange(fromVal, toVal).tables.filter(
    (n) => n <= tableCount,
  );

  const rowsForDay = (d: number): DraftRange[] =>
    draftsByDay[d] ??
    shift.template
      .filter((p) => p.weekday === d)
      .map((p) => ({
        employeeId: p.employeeId,
        from: String(p.from),
        to: String(p.to),
      }));

  const reasonText = (reason?: string) => {
    const k = `recepcion.error.${reason ?? "error"}`;
    const txt = t(k);
    return txt === k ? t("recepcion.error.error") : txt;
  };

  const run = async (
    id: string,
    fn: () => Promise<{ ok: boolean; reason?: string }>,
    okMsg: string,
  ) => {
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
    ? new Date(`${shift.date}T12:00:00`).toLocaleDateString(
        locale === "en" ? "en-GB" : "es-AR",
        { day: "2-digit", month: "2-digit" },
      )
    : "";

  const assignOne = (mesa: number, employeeId: string | null) =>
    run(
      `m-${mesa}`,
      () => assignTable(branchId!, mesa, employeeId, actorId),
      t("recepcion.asignado"),
    );

  const fillRangeDefaults = () => {
    if (freeToday) {
      setFrom(String(freeToday.from));
      setTo(String(freeToday.to));
    }
  };

  const mesaChip = (
    n: number,
    employeeId: string | null,
    opts?: { showName?: boolean; onClick?: () => void },
  ) => {
    const busyMesa = occupied.has(n);
    const selected = picked === n;
    const cls = `${CHIP} ${
      busyMesa
        ? "bg-rose-600 text-crema"
        : selected
          ? "bg-marca text-crema ring-2 ring-marca ring-offset-2 ring-offset-surface"
          : toneFor(employeeId, empIds)
    }`;
    const inner = (
      <>
        <span className="font-display leading-none">{n}</span>
        {opts?.showName && employeeId && !busyMesa ? (
          <span className="mt-0.5 max-w-full truncate px-0.5 text-[9px] font-semibold leading-tight opacity-90">
            {firstName(empName(employeeId) || byTable.get(n)?.employeeName)}
          </span>
        ) : null}
      </>
    );
    if (!opts?.onClick) {
      return (
        <div key={n} className={cls}>
          {inner}
        </div>
      );
    }
    return (
      <button
        key={n}
        type="button"
        disabled={busy != null}
        onClick={opts.onClick}
        className={cls}
      >
        {inner}
      </button>
    );
  };

  const draftOwner = (n: number) => {
    for (const row of drafts) {
      if (parseRange(row.from, row.to).tables.includes(n)) return row.employeeId;
    }
    return "";
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="min-w-0 rounded-[24px] border border-marca/20 bg-surface p-4 shadow-sm sm:p-5">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-marca">
            {t("recepcion.jornadaHoy")}
          </p>
          <h2 className="font-display text-2xl uppercase tracking-tight text-carbon">
            {t(`recepcion.dia.${shift.weekday || dia}`)}
            {fecha ? ` — ${fecha}` : ""}
          </h2>
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
          <>
            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-carbon/50">
              {t("recepcion.todasLasMesas")}
            </p>
            <div className={`mt-2 ${MESAS}`}>
              {mesas.map((n) =>
                mesaChip(n, byTable.get(n)?.employeeId ?? null, {
                  showName: true,
                  onClick: () => {
                    setPicked(n);
                    setPickEmp(
                      byTable.get(n)?.employeeId ??
                        (canManage ? empId : actorId ?? ""),
                    );
                  },
                }),
              )}
            </div>

            <ul className="mt-4 flex flex-col gap-2">
              {staff.map((s) => (
                <li
                  key={s.id}
                  className="rounded-2xl border border-linea bg-crema/30 px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-carbon">{s.name}</p>
                    <p className="text-sm tabular-nums text-carbon/70">
                      {t("recepcion.mesasRango", {
                        rango: formatTableRange(s.tables),
                      })}
                    </p>
                  </div>
                  <div className={`mt-2 ${MESAS}`}>
                    {s.tables.map((n) =>
                      mesaChip(n, s.id, {
                        onClick: () => {
                          setPicked(n);
                          setPickEmp(s.id);
                        },
                      }),
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {libres.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-carbon/50">
                  {t("recepcion.mesasLibres")}
                </p>
                <div className={`mt-2 ${MESAS}`}>
                  {libres.map((n) =>
                    mesaChip(n, null, {
                      onClick: () => {
                        setPicked(n);
                        setPickEmp(canManage ? empId : actorId ?? "");
                      },
                    }),
                  )}
                </div>
              </div>
            )}
          </>
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
                  className="w-full sm:flex-1"
                  triggerClassName="min-h-11 w-full"
                  ariaLabel={t("recepcion.atiende")}
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
                  className={`${BTN} bg-marca text-crema`}
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
                className={`${BTN} bg-marca text-crema`}
              >
                {t("recepcion.tomar")}
              </button>
            ) : null}
          </div>
        )}

        {canManage && employees.length > 0 && mesaOpts.length > 0 && (
          <form
            className="mt-5 border-t border-linea pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              const { a, b } = parseRange(fromVal, toVal);
              if (!empId || !parseRange(fromVal, toVal).tables.length) return;
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
            <div className="mt-2 flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-xs font-semibold text-carbon/55">
                {t("recepcion.atiende")}
                <Select
                  value={empId}
                  onChange={setRangeEmp}
                  className="w-full"
                  triggerClassName="min-h-11 w-full"
                  ariaLabel={t("recepcion.atiende")}
                  options={employees.map((e) => ({
                    value: e.id,
                    label: e.name,
                  }))}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs font-semibold text-carbon/55">
                  {t("recepcion.mesaDesde")}
                  <Select
                    value={fromVal}
                    onChange={(v) => {
                      setFrom(v);
                      if (Number(v) > Number(toVal)) setTo(v);
                    }}
                    className="w-full"
                    triggerClassName="min-h-11 w-full"
                    ariaLabel={t("recepcion.mesaDesde")}
                    options={mesaOpts}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-carbon/55">
                  {t("recepcion.mesaHasta")}
                  <Select
                    value={toVal}
                    onChange={(v) => {
                      setTo(v);
                      if (Number(v) < Number(fromVal)) setFrom(v);
                    }}
                    className="w-full"
                    triggerClassName="min-h-11 w-full"
                    ariaLabel={t("recepcion.mesaHasta")}
                    options={mesaOpts}
                  />
                </label>
              </div>
              {rangePreview.length > 0 && (
                <div>
                  <p className="text-sm tabular-nums text-carbon/70">
                    {empName(empId) || t("recepcion.atiende")}
                    {" · "}
                    {t("recepcion.mesasRango", {
                      rango: formatTableRange(rangePreview),
                    })}
                  </p>
                  <div className={`mt-2 ${MESAS}`}>
                    {rangePreview.map((n) =>
                      mesaChip(n, empId || null),
                    )}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={fillRangeDefaults}
                className="self-start text-sm font-semibold text-marca underline-offset-4 hover:underline"
              >
                {freeToday
                  ? t("recepcion.mesasRango", {
                      rango: `${freeToday.from}–${freeToday.to}`,
                    })
                  : t("recepcion.sinMesasLibres")}
              </button>
              <button
                type="submit"
                disabled={busy != null || !empId || !rangePreview.length}
                className={`${BTN} bg-marca text-crema`}
              >
                {t("recepcion.asignar")}
              </button>
              <button
                type="button"
                disabled={busy != null || !rangePreview.length}
                onClick={() => {
                  const { a, b } = parseRange(fromVal, toVal);
                  if (!parseRange(fromVal, toVal).tables.length) return;
                  void run(
                    "quitar",
                    () => assignTableRange(branchId!, a, b, null, actorId),
                    t("recepcion.asignado"),
                  );
                }}
                className={`${BTN} border border-linea text-carbon/70`}
              >
                {t("recepcion.quitar")}
              </button>
            </div>
          </form>
        )}

        {canManage && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              disabled={busy != null}
              onClick={() =>
                void run(
                  "fill",
                  () => applyShiftTemplate(branchId!, false),
                  t("recepcion.hoyCompletado"),
                )
              }
              className="min-h-11 w-full text-sm font-semibold text-marca underline-offset-4 hover:underline disabled:opacity-50 sm:w-auto"
            >
              {t("recepcion.aplicarHoy")}
            </button>
            <button
              type="button"
              disabled={busy != null}
              onClick={() => {
                if (!window.confirm(t("recepcion.resetHoyConfirmar"))) return;
                void run(
                  "reset",
                  () => applyShiftTemplate(branchId!, true),
                  t("recepcion.hoyReemplazado"),
                );
              }}
              className="min-h-11 w-full text-sm font-semibold text-carbon/55 underline-offset-4 hover:underline disabled:opacity-50 sm:w-auto"
            >
              {t("recepcion.resetHoy")}
            </button>
          </div>
        )}
      </section>

      {canManage && (
        <section className="min-w-0 rounded-[24px] border border-linea bg-surface p-4 shadow-sm sm:p-5">
          <h3 className="font-display text-xl uppercase tracking-tight text-carbon">
            {t("recepcion.plantilla")}
          </h3>
          <p className="mt-1 text-sm text-carbon/55">{t("recepcion.plantillaSub")}</p>

          <div className="mt-3 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((d) => {
              const active = dia === d;
              const rows = rowsForDay(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDiaOverride(d)}
                  className={`flex min-h-[4.75rem] flex-col items-center rounded-2xl border-2 px-0.5 py-1.5 text-center ${
                    active
                      ? "border-marca bg-marca text-crema"
                      : "border-linea text-carbon/70 hover:border-carbon/25"
                  }`}
                >
                  <span className="text-[11px] font-bold uppercase tracking-wide">
                    {t(`recepcion.diaCorto.${d}`)}
                  </span>
                  <span
                    className={`mt-1 line-clamp-3 w-full text-[9px] font-semibold leading-tight ${
                      active ? "text-crema/90" : "text-carbon/55"
                    }`}
                  >
                    {rows.length
                      ? rows
                          .map((r) => {
                            const name = firstName(empName(r.employeeId));
                            const rango = formatTableRange(
                              parseRange(r.from, r.to).tables,
                            );
                            return name ? `${name} ${rango}` : rango;
                          })
                          .join(" · ")
                      : "—"}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-4 font-display text-lg uppercase tracking-tight text-carbon">
            {t(`recepcion.dia.${dia}`)}
          </p>

          {mesas.length > 0 && (
            <>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-carbon/50">
                {t("recepcion.todasLasMesas")}
              </p>
              <div className={`mt-2 ${MESAS}`}>
                {mesas.map((n) => {
                  const owner = draftOwner(n);
                  return (
                    <div
                      key={n}
                      className={`${CHIP} ${toneFor(owner || null, empIds)}`}
                    >
                      <span className="font-display leading-none">{n}</span>
                      {owner ? (
                        <span className="mt-0.5 max-w-full truncate px-0.5 text-[9px] font-semibold leading-tight opacity-90">
                          {firstName(empName(owner))}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <ul className="mt-3 flex flex-col gap-3">
            {drafts.map((row, i) => {
              const preview = parseRange(row.from, row.to).tables.filter(
                (n) => n <= tableCount,
              );
              return (
                <li
                  key={`${row.employeeId}-${i}`}
                  className="flex flex-col gap-2 rounded-2xl border border-linea p-3"
                >
                  <label className="flex flex-col gap-1 text-xs font-semibold text-carbon/55">
                    {t("recepcion.atiende")}
                    <Select
                      value={row.employeeId}
                      onChange={(employeeId) =>
                        setDrafts((rows) =>
                          rows.map((r, j) =>
                            j === i ? { ...r, employeeId } : r,
                          ),
                        )
                      }
                      className="w-full"
                      triggerClassName="min-h-11 w-full"
                      ariaLabel={t("recepcion.atiende")}
                      options={employees.map((emp) => ({
                        value: emp.id,
                        label: emp.name,
                      }))}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-xs font-semibold text-carbon/55">
                      {t("recepcion.mesaDesde")}
                      <Select
                        value={row.from}
                        onChange={(fromVal) =>
                          setDrafts((rows) =>
                            rows.map((r, j) =>
                              j === i
                                ? {
                                    ...r,
                                    from: fromVal,
                                    to:
                                      Number(fromVal) > Number(r.to)
                                        ? fromVal
                                        : r.to,
                                  }
                                : r,
                            ),
                          )
                        }
                        className="w-full"
                        triggerClassName="min-h-11 w-full"
                        ariaLabel={t("recepcion.mesaDesde")}
                        options={mesaOpts}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-semibold text-carbon/55">
                      {t("recepcion.mesaHasta")}
                      <Select
                        value={row.to}
                        onChange={(toVal) =>
                          setDrafts((rows) =>
                            rows.map((r, j) =>
                              j === i
                                ? {
                                    ...r,
                                    to: toVal,
                                    from:
                                      Number(toVal) < Number(r.from)
                                        ? toVal
                                        : r.from,
                                  }
                                : r,
                            ),
                          )
                        }
                        className="w-full"
                        triggerClassName="min-h-11 w-full"
                        ariaLabel={t("recepcion.mesaHasta")}
                        options={mesaOpts}
                      />
                    </label>
                  </div>
                  {preview.length > 0 && (
                    <p className="text-sm tabular-nums text-carbon/70">
                      {empName(row.employeeId)}
                      {" · "}
                      {t("recepcion.mesasRango", {
                        rango: formatTableRange(preview),
                      })}
                    </p>
                  )}
                  {preview.length > 0 && (
                    <div className={MESAS}>
                      {preview.map((n) => (
                        <div
                          key={n}
                          className={`${CHIP} ${toneFor(row.employeeId, empIds)}`}
                        >
                          {n}
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setDrafts((rows) => rows.filter((_, j) => j !== i))
                    }
                    className="min-h-11 w-full text-sm font-semibold text-carbon/50 underline-offset-4 hover:underline sm:w-auto"
                  >
                    {t("recepcion.quitarRango")}
                  </button>
                </li>
              );
            })}
          </ul>

          {!drafts.length && (
            <p className="mt-3 text-sm text-carbon/50">
              {t("recepcion.sinPlantilla")}
            </p>
          )}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={() => {
                const taken = drafts.map((r) => ({
                  from: Number(r.from),
                  to: Number(r.to),
                }));
                const free = nextFreeRange(tableCount, taken);
                if (!free) {
                  toast(t("recepcion.sinMesasLibres"), "error");
                  return;
                }
                setDrafts((rows) => [
                  ...rows,
                  {
                    employeeId: employees[0]?.id ?? "",
                    from: String(free.from),
                    to: String(free.to),
                  },
                ]);
              }}
              className={`${BTN} border border-marca/40 text-marca`}
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
              className={`${BTN} bg-marca text-crema`}
            >
              {t("recepcion.guardarDia")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
