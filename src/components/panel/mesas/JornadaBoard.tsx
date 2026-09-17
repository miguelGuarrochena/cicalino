"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useToast } from "@/components/ui/Toast";
import { Select } from "@/components/ui/Select";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import type { EmployeeUI } from "@/lib/store/config-store";
import {
  WEEKDAYS,
  assignmentByTable,
  assignmentsForTramo,
  compactRanges,
  currentFloorTramo,
  firstName,
  formatTableRange,
  nextFreeRange,
  ownersFromTemplate,
  rangesFromOwners,
  staffOnShift,
  tablesInRange,
  unassignedTables,
  type FloorTramo,
  type ShiftDay,
} from "@/lib/floorShift";
import {
  applyShiftTemplate,
  assignTable,
  assignTableRange,
  saveShiftWeek,
  setFloorTurnos,
} from "@/lib/data/floorShift";

const BTN =
  "min-h-11 w-full rounded-full px-4 text-sm font-semibold disabled:opacity-50 sm:w-auto";
const MESAS =
  "grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8";
const CHIP =
  "relative flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-2xl px-0.5 text-center";
const EMP_TONE = [
  "bg-marca text-crema",
  "bg-espera text-crema",
  "bg-curso text-crema",
  "bg-carbon text-crema",
  "bg-[#5b4a8a] text-crema",
  "bg-marca/65 text-crema",
];

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

const draftKey = (tramo: FloorTramo, d: number) => `${tramo}-${d}`;

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

  const [turnos, setTurnos] = useState<1 | 2>(shift.turnosPiso);
  const [tramo, setTramo] = useState<FloorTramo>(() =>
    currentFloorTramo(shift.turnosPiso),
  );
  useEffect(() => {
    setTurnos(shift.turnosPiso);
  }, [shift.turnosPiso]);
  const activeTramo: FloorTramo = turnos === 2 ? tramo : "manana";
  const todayRows = useMemo(
    () => assignmentsForTramo(shift.assignments, activeTramo),
    [shift.assignments, activeTramo],
  );
  const byTable = useMemo(() => assignmentByTable(todayRows), [todayRows]);
  const staff = useMemo(() => staffOnShift(todayRows), [todayRows]);
  const libres = useMemo(
    () => unassignedTables(tableCount, todayRows),
    [tableCount, todayRows],
  );
  const ocupadasN = [...occupied].length;
  const takenToday = useMemo(
    () =>
      compactRanges(
        todayRows.filter((a) => a.employeeId).map((a) => a.tableNumber),
      ),
    [todayRows],
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
  const [brush, setBrush] = useState(employees[0]?.id ?? "");
  const [diaOverride, setDiaOverride] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<
    Partial<Record<string, Record<number, string>>>
  >({});
  const dia = diaOverride ?? (shift.weekday || 1);
  const empId = rangeEmp || employees[0]?.id || "";
  const rangePreview = parseRange(fromVal, toVal).tables.filter(
    (n) => n <= tableCount,
  );

  const ownersOf = (d: number) =>
    drafts[draftKey(activeTramo, d)] ??
    ownersFromTemplate(shift.template, d, activeTramo);
  const owners = ownersOf(dia);

  const markTable = (n: number, employeeId: string | null) => {
    setDrafts((prev) => {
      const k = draftKey(activeTramo, dia);
      const cur = { ...(prev[k] ?? ownersFromTemplate(shift.template, dia, activeTramo)) };
      if (!employeeId) delete cur[n];
      else cur[n] = employeeId;
      return { ...prev, [k]: cur };
    });
  };

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
      () => assignTable(branchId!, mesa, employeeId, actorId, activeTramo),
      t("recepcion.asignado"),
    );

  const mesaChip = (
    n: number,
    employeeId: string | null,
    opts?: { onClick?: () => void; selected?: boolean },
  ) => {
    const busyMesa = occupied.has(n);
    const selected = opts?.selected ?? picked === n;
    const name =
      employeeId
        ? firstName(empName(employeeId) || byTable.get(n)?.employeeName)
        : "";
    const cls = `${CHIP} ${toneFor(employeeId, empIds)} ${
      selected ? "ring-2 ring-marca ring-offset-2 ring-offset-surface" : ""
    } ${busyMesa ? "ring-2 ring-rose-600" : ""}`;
    const inner = (
      <>
        <span className="font-display text-lg leading-none">{n}</span>
        {name ? (
          <span className="line-clamp-2 max-w-full px-0.5 text-xs font-bold leading-tight">
            {name}
          </span>
        ) : null}
        {busyMesa ? (
          <span className="absolute right-1 top-1 size-2 rounded-full bg-rose-600" />
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

  const empPicker = (onPick: (id: string | null) => void, selectedId?: string) => (
    <div className="flex flex-col gap-2">
      {employees.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => onPick(e.id)}
          className={`flex min-h-12 items-center gap-3 rounded-2xl border-2 px-3 text-left ${
            selectedId === e.id
              ? "border-carbon"
              : "border-transparent"
          }`}
        >
          <span className={`size-8 shrink-0 rounded-full ${toneFor(e.id, empIds)}`} />
          <span className="text-base font-bold text-carbon">{e.name}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => onPick(null)}
        className="flex min-h-11 items-center gap-3 rounded-2xl px-3 text-left text-sm font-semibold text-carbon/55"
      >
        <span className="size-8 shrink-0 rounded-full bg-surface ring-1 ring-dashed ring-linea" />
        {t("recepcion.sinAsignar")}
      </button>
    </div>
  );

  const tramoSwitch =
    turnos === 2 ? (
      <SegmentedTabs
        ariaLabel={t("recepcion.plantilla")}
        value={activeTramo}
        onChange={(id) => {
          setTramo(id);
          setPicked(null);
        }}
        options={[
          { id: "manana", label: t("recepcion.tramoManana") },
          { id: "noche", label: t("recepcion.tramoNoche") },
        ]}
      />
    ) : null;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
      {canManage && (
        <SegmentedTabs
          ariaLabel={t("recepcion.plantilla")}
          value={String(turnos)}
          onChange={(id) => {
            const n = id === "2" ? 2 : 1;
            setTurnos(n);
            if (n === 1) setTramo("manana");
            void run(
              "turnos",
              () => setFloorTurnos(branchId!, n),
              n === 2 ? t("recepcion.dosTurnos") : t("recepcion.unTurno"),
            );
          }}
          options={[
            { id: "1", label: t("recepcion.unTurno") },
            { id: "2", label: t("recepcion.dosTurnos") },
          ]}
        />
      )}
      {turnos === 2 ? tramoSwitch : null}
      </div>

      <section className="min-w-0 rounded-[24px] border border-marca/20 bg-surface p-4 shadow-sm sm:p-5">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-marca">
            {t("recepcion.jornadaHoy")}
            {turnos === 2
              ? ` · ${t(activeTramo === "noche" ? "recepcion.tramoNoche" : "recepcion.tramoManana")}`
              : ` · ${t("recepcion.tramoUnico")}`}
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
            <ul className="mt-4 flex flex-col gap-1.5">
              {employees.map((e) => (
                <li key={e.id} className="flex items-center gap-3">
                  <span className={`size-7 shrink-0 rounded-full ${toneFor(e.id, empIds)}`} />
                  <span className="text-base font-bold text-carbon">{e.name}</span>
                  <span className="text-sm tabular-nums text-carbon/55">
                    {formatTableRange(staff.find((s) => s.id === e.id)?.tables ?? []) || "—"}
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-carbon/50">
              {t("recepcion.todasLasMesas")}
            </p>
            <div className={`mt-2 ${MESAS}`}>
              {mesas.map((n) =>
                mesaChip(n, byTable.get(n)?.employeeId ?? null, {
                  onClick: () => setPicked(n),
                }),
              )}
            </div>
          </>
        )}

        {picked != null && (
          <div className="mt-4 rounded-2xl border border-marca/25 bg-marca/5 p-3">
            <p className="mb-2 text-sm font-bold text-carbon">
              {t("mesa.mesaN", { n: picked })}
              {" · "}
              {t("recepcion.elegiQuien")}
            </p>
            {canManage
              ? empPicker((id) => {
                  const mesa = picked;
                  setPicked(null);
                  void assignOne(mesa, id);
                }, byTable.get(picked)?.employeeId ?? undefined)
              : actorId && !byTable.get(picked)?.employeeId ? (
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
                () =>
                  assignTableRange(branchId!, a, b, empId, actorId, activeTramo),
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
              <button
                type="submit"
                disabled={busy != null || !empId || !rangePreview.length}
                className={`${BTN} bg-marca text-crema`}
              >
                {t("recepcion.asignar")}
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
              const has = Object.keys(ownersOf(d)).length > 0;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setDiaOverride(d);
                    setPicked(null);
                  }}
                  className={`flex min-h-12 flex-col items-center justify-center rounded-2xl border-2 px-0.5 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide ${
                    active
                      ? "border-marca bg-marca text-crema"
                      : "border-linea text-carbon/70 hover:border-carbon/25"
                  }`}
                >
                  {t(`recepcion.diaCorto.${d}`)}
                  <span
                    className={`mt-1 size-1.5 rounded-full ${
                      has ? (active ? "bg-crema" : "bg-marca") : "bg-transparent"
                    }`}
                  />
                </button>
              );
            })}
          </div>

          <p className="mt-4 font-display text-lg uppercase tracking-tight text-carbon">
            {t(`recepcion.dia.${dia}`)}
            {turnos === 2
              ? ` · ${t(activeTramo === "noche" ? "recepcion.tramoNoche" : "recepcion.tramoManana")}`
              : ""}
          </p>

          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-carbon/50">
            {t("recepcion.marcarCon")}
          </p>
          <div className="mt-2 flex flex-col gap-1.5">
            {employees.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setBrush(e.id)}
                className={`flex min-h-12 items-center gap-3 rounded-2xl border-2 px-3 text-left ${
                  brush === e.id ? "border-carbon" : "border-transparent"
                }`}
              >
                <span className={`size-8 shrink-0 rounded-full ${toneFor(e.id, empIds)}`} />
                <span className="text-base font-bold text-carbon">{e.name}</span>
                <span className="ml-auto text-sm tabular-nums text-carbon/55">
                  {formatTableRange(
                    Object.entries(owners)
                      .filter(([, id]) => id === e.id)
                      .map(([n]) => Number(n)),
                  ) || "—"}
                </span>
              </button>
            ))}
          </div>

          {mesas.length > 0 && (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-carbon/50">
                {t("recepcion.todasLasMesas")}
              </p>
              <div className={`mt-2 ${MESAS}`}>
                {mesas.map((n) => {
                  const owner = owners[n] || null;
                  return mesaChip(n, owner, {
                    selected: false,
                    onClick: () => {
                      if (!brush) {
                        setBrush(employees[0]?.id ?? "");
                      }
                      markTable(n, owner === brush ? null : brush || employees[0]?.id || null);
                    },
                  });
                })}
              </div>
            </>
          )}

          {!Object.keys(owners).length && (
            <p className="mt-3 text-sm text-carbon/50">
              {t("recepcion.sinPlantilla")}
            </p>
          )}

          <div className="mt-4">
            <button
              type="button"
              disabled={busy != null || !employees.length}
              onClick={() => {
                const rows: {
                  weekday: number;
                  employeeId: string;
                  from: number;
                  to: number;
                }[] = [];
                for (const d of WEEKDAYS) {
                  for (const r of rangesFromOwners(ownersOf(d))) {
                    rows.push({ weekday: d, ...r });
                  }
                }
                void run(
                  "semana",
                  async () => {
                    const res = await saveShiftWeek(branchId!, activeTramo, rows);
                    if (res.ok) {
                      setDrafts((p) => {
                        const n = { ...p };
                        for (const d of WEEKDAYS) delete n[draftKey(activeTramo, d)];
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
              {t("recepcion.guardarSemana")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
