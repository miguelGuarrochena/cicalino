"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { Select } from "@/components/ui/Select";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { DayShiftModal } from "@/components/panel/mesas/DayShiftModal";
import { DayNavBtn } from "@/components/panel/mesas/DayNavBtn";
import { MesaChip } from "@/components/panel/mesas/MesaChip";
import { RangeAssignModal } from "@/components/panel/mesas/RangeAssignModal";
import { WeekCalendar } from "@/components/panel/mesas/WeekCalendar";
import {
  BTN,
  FREE_BRUSH,
  MESAS,
  allMesas,
  draftKey,
  parseRange,
  uniqueIds,
  weekdayFromOffset,
  weekdaysInSpan,
  shiftWeekday,
} from "@/components/panel/mesas/jornadaUi";
import type { EmployeeUI } from "@/lib/store/config-store";
import {
  WEEKDAYS,
  assignmentByTable,
  assignmentsForTramo,
  compactRanges,
  currentFloorTramo,
  firstName,
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

type OpenUi =
  | null
  | { kind: "day" }
  | { kind: "range"; scope: "today" | "week" }
  | { kind: "mesa"; table: number };

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
  const confirmar = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const mesas = useMemo(() => allMesas(tableCount), [tableCount]);
  const mesaOpts = useMemo(
    () => mesas.map((n) => ({ value: String(n), label: String(n) })),
    [mesas],
  );
  const dayOpts = useMemo(
    () =>
      WEEKDAYS.map((d) => ({
        value: String(d),
        label: t(`recepcion.diaCorto.${d}`),
      })),
    [t],
  );
  const empIds = useMemo(() => employees.map((e) => e.id), [employees]);
  const empOpts = useMemo(
    () => employees.map((e) => ({ value: e.id, label: e.name })),
    [employees],
  );
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

  const [open, setOpen] = useState<OpenUi>(null);
  const [brush, setBrush] = useState("");
  const [diaOverride, setDiaOverride] = useState<number | null>(null);
  const [dayOffset, setDayOffset] = useState(0);
  const [drafts, setDrafts] = useState<
    Partial<Record<string, Record<number, string>>>
  >({});
  const dia = diaOverride ?? (shift.weekday || 1);
  const todayWeekday = shift.weekday || 1;
  const viewWeekday = weekdayFromOffset(todayWeekday, dayOffset);
  const viewingToday = dayOffset === 0;

  const ownersOf = (d: number) =>
    drafts[draftKey(activeTramo, d)] ??
    ownersFromTemplate(shift.template, d, activeTramo);
  const owners = ownersOf(dia);
  const viewOwners = ownersOf(viewWeekday);

  const markTable = (n: number, employeeId: string | null, day = dia) => {
    setDrafts((prev) => {
      const k = draftKey(activeTramo, day);
      const cur = {
        ...(prev[k] ?? ownersFromTemplate(shift.template, day, activeTramo)),
      };
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

  const fechaDe = (offset: number) => {
    if (!shift.date) return "";
    const d = new Date(`${shift.date}T12:00:00`);
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString(locale === "en" ? "en-GB" : "es-AR", {
      day: "2-digit",
      month: "2-digit",
    });
  };
  const viewFecha = fechaDe(dayOffset);

  const assignOne = (mesa: number, employeeId: string | null) =>
    run(
      `m-${mesa}`,
      () => assignTable(branchId!, mesa, employeeId, actorId, activeTramo),
      t("recepcion.asignado"),
    );

  const tramoLabel =
    turnos === 2
      ? t(activeTramo === "noche" ? "recepcion.tramoNoche" : "recepcion.tramoManana")
      : t("recepcion.tramoUnico");

  const closeUi = () => setOpen(null);

  const openDay = (d: number) => {
    setDiaOverride(d);
    setBrush("");
    setOpen({ kind: "day" });
  };

  const openRange = (scope: "today" | "week") => {
    setOpen({ kind: "range", scope });
  };

  const applyWeekRange = (payload: {
    employeeId: string;
    dayFrom: number;
    dayTo: number;
    mesaFrom: number;
    mesaTo: number;
  }) => {
    const days = weekdaysInSpan(payload.dayFrom, payload.dayTo);
    const tables = tablesInRange(payload.mesaFrom, payload.mesaTo).filter(
      (n) => n <= tableCount,
    );
    setDrafts((prev) => {
      const next = { ...prev };
      for (const d of days) {
        const k = draftKey(activeTramo, d);
        const cur = {
          ...(next[k] ?? ownersFromTemplate(shift.template, d, activeTramo)),
        };
        for (const n of tables) {
          if (payload.employeeId === FREE_BRUSH) delete cur[n];
          else cur[n] = payload.employeeId;
        }
        next[k] = cur;
      }
      return next;
    });
    closeUi();
  };

  const saveWeek = () => {
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
  };

  const picked = open?.kind === "mesa" ? open.table : null;
  const rangeScope = open?.kind === "range" ? open.scope : null;
  const rangeMesaFrom = String(freeToday?.from ?? mesas[0] ?? 1);
  const rangeMesaTo = String(freeToday?.to ?? mesas[0] ?? 1);

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
        {turnos === 2 ? (
          <SegmentedTabs
            ariaLabel={t("recepcion.plantilla")}
            value={activeTramo}
            onChange={(id) => {
              setTramo(id);
              closeUi();
            }}
            options={[
              { id: "manana", label: t("recepcion.tramoManana") },
              { id: "noche", label: t("recepcion.tramoNoche") },
            ]}
          />
        ) : null}
      </div>

      <section className="min-w-0 rounded-[24px] border border-marca/20 bg-surface p-4 shadow-sm sm:p-5">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-marca">
            {viewingToday ? t("recepcion.jornadaHoy") : t("recepcion.plantilla")}
            {` · ${tramoLabel}`}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <DayNavBtn
              dir="prev"
              label={t("recepcion.diaAnterior")}
              onClick={() => {
                setDayOffset((n) => n - 1);
                closeUi();
              }}
            />
            <h2 className="min-w-0 flex-1 text-center font-display text-2xl uppercase tracking-tight text-carbon">
              {t(`recepcion.dia.${viewWeekday}`)}
              {viewFecha ? ` — ${viewFecha}` : ""}
            </h2>
            <DayNavBtn
              dir="next"
              label={t("recepcion.diaSiguiente")}
              onClick={() => {
                setDayOffset((n) => n + 1);
                closeUi();
              }}
            />
          </div>
        </header>

        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-carbon/55">
          {viewingToday ? (
            <>
              <span className="rounded-full bg-marca/10 px-2.5 py-1 text-marca">
                {staff.length} {t("recepcion.enTurno")}
              </span>
              <span className="rounded-full bg-carbon/5 px-2.5 py-1">
                {libres.length} {t("recepcion.mesasLibres")}
              </span>
              <span className="rounded-full bg-carbon/5 px-2.5 py-1">
                {ocupadasN} {t("recepcion.ocupadas")}
              </span>
            </>
          ) : (
            <>
              <span className="rounded-full bg-marca/10 px-2.5 py-1 text-marca">
                {uniqueIds(viewOwners).length} {t("recepcion.enTurno")}
              </span>
              <span className="rounded-full bg-carbon/5 px-2.5 py-1">
                {mesas.filter((n) => !viewOwners[n]).length}{" "}
                {t("recepcion.mesasLibres")}
              </span>
            </>
          )}
        </div>

        {!employees.length ? (
          <p className="mt-4 text-sm text-carbon/55">{t("recepcion.sinEmpleados")}</p>
        ) : (
          <>
            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-carbon/50">
              {t("recepcion.todasLasMesas")}
            </p>
            <div className={`mt-2 ${MESAS}`}>
              {mesas.map((n) => {
                if (viewingToday) {
                  const row = byTable.get(n);
                  return (
                    <MesaChip
                      key={n}
                      n={n}
                      employeeId={row?.employeeId ?? null}
                      empIds={empIds}
                      name={
                        row?.employeeId
                          ? firstName(empName(row.employeeId) || row.employeeName)
                          : ""
                      }
                      occupied={occupied.has(n)}
                      selected={picked === n}
                      disabled={busy != null}
                      onClick={() => setOpen({ kind: "mesa", table: n })}
                    />
                  );
                }
                const owner = viewOwners[n] || null;
                return (
                  <MesaChip
                    key={n}
                    n={n}
                    employeeId={owner}
                    empIds={empIds}
                    name={owner ? firstName(empName(owner)) : ""}
                    onClick={
                      canManage ? () => openDay(viewWeekday) : undefined
                    }
                  />
                );
              })}
            </div>
          </>
        )}

        {viewingToday && canManage && employees.length > 0 && mesaOpts.length > 0 ? (
          <button
            type="button"
            disabled={busy != null}
            onClick={() => openRange("today")}
            className={`${BTN} mt-4 border border-linea bg-crema/60 text-carbon`}
          >
            {t("recepcion.asignarRango")}
          </button>
        ) : null}

        {viewingToday && canManage && (
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
                void (async () => {
                  const ok = await confirmar({
                    title: t("recepcion.resetHoy"),
                    body: t("recepcion.resetHoyConfirmar"),
                    confirmLabel: t("recepcion.resetHoy"),
                    tone: "peligro",
                  });
                  if (!ok) return;
                  await run(
                    "reset",
                    () => applyShiftTemplate(branchId!, true),
                    t("recepcion.hoyReemplazado"),
                  );
                })();
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

          <div className="mt-4">
            <WeekCalendar
              selected={open?.kind === "day" ? dia : null}
              empIds={empIds}
              ownersOf={ownersOf}
              onSelectDay={openDay}
              dayLabel={(d) => t(`recepcion.diaCorto.${d}`)}
            />
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              disabled={busy != null || !employees.length || !mesaOpts.length}
              onClick={() => openRange("week")}
              className={`${BTN} border border-linea bg-crema/60 text-carbon`}
            >
              {t("recepcion.asignarRango")}
            </button>
            <button
              type="button"
              disabled={busy != null || !employees.length}
              onClick={saveWeek}
              className={`${BTN} bg-marca text-crema`}
            >
              {t("recepcion.guardarSemana")}
            </button>
          </div>
        </section>
      )}

      {open?.kind === "day" ? (
        <DayShiftModal
          weekday={dia}
          tramoLabel={tramoLabel}
          owners={owners}
          employees={employees}
          empIds={empIds}
          mesas={mesas}
          brush={brush}
          busy={busy != null}
          onBrush={setBrush}
          onMark={(n) => {
            if (brush === FREE_BRUSH) {
              markTable(n, null);
              return;
            }
            if (!brush) return;
            const owner = owners[n] || null;
            markTable(n, owner === brush ? null : brush);
          }}
          onShiftDay={(delta) => setDiaOverride(shiftWeekday(dia, delta))}
          onClose={closeUi}
        />
      ) : null}

      {rangeScope ? (
        <RangeAssignModal
          scope={rangeScope}
          employees={[
            { value: FREE_BRUSH, label: t("recepcion.dejarLibre") },
            ...empOpts,
          ]}
          mesaOpts={mesaOpts}
          dayOpts={dayOpts}
          defaultEmp={brush}
          defaultDayFrom={String(dia)}
          defaultDayTo={String(dia)}
          defaultMesaFrom={rangeMesaFrom}
          defaultMesaTo={rangeMesaTo}
          busy={busy != null}
          onClose={closeUi}
          onAssign={(payload) => {
            if (rangeScope === "today") {
              const { a, b, tables } = parseRange(
                String(payload.mesaFrom),
                String(payload.mesaTo),
              );
              const empId =
                payload.employeeId === FREE_BRUSH ? null : payload.employeeId;
              if ((empId == null && payload.employeeId !== FREE_BRUSH) || !tables.length) {
                return;
              }
              closeUi();
              void run(
                "rango",
                () =>
                  assignTableRange(
                    branchId!,
                    a,
                    b,
                    empId,
                    actorId,
                    activeTramo,
                  ),
                t("recepcion.asignado"),
              );
              return;
            }
            applyWeekRange(payload);
          }}
        />
      ) : null}

      {picked != null ? (
        <ModalShell onClose={closeUi} labelledBy="jornada-mesa-title">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2
              id="jornada-mesa-title"
              className="font-display text-2xl uppercase tracking-tight text-carbon"
            >
              {t("mesa.mesaN", { n: picked })}
            </h2>
            <ModalCloseBtn onClick={closeUi} label={t("mesa.cerrar")} />
          </div>
          <p className="mb-3 text-sm text-carbon/55">{t("recepcion.elegiQuien")}</p>
          {canManage ? (
            <Select
              value={byTable.get(picked)?.employeeId ?? ""}
              onChange={(id) => {
                const mesa = picked;
                closeUi();
                const cur = byTable.get(mesa)?.employeeId ?? "";
                if (id === cur) return;
                void assignOne(mesa, id || null);
              }}
              placeholder="—"
              className="w-full"
              triggerClassName="min-h-11 w-full"
              ariaLabel={t("recepcion.elegiQuien")}
              options={[
                { value: "", label: t("recepcion.dejarLibre") },
                ...empOpts,
              ]}
            />
          ) : actorId && !byTable.get(picked)?.employeeId ? (
            <button
              type="button"
              disabled={busy != null}
              onClick={() => {
                const mesa = picked;
                closeUi();
                void assignOne(mesa, actorId);
              }}
              className={`${BTN} bg-marca text-crema`}
            >
              {t("recepcion.tomar")}
            </button>
          ) : (
            <p className="text-base font-bold text-carbon">
              {byTable.get(picked)?.employeeName || t("recepcion.sinAsignar")}
            </p>
          )}
        </ModalShell>
      ) : null}
    </div>
  );
};
