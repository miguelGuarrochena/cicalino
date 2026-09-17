"use client";

import { useApp } from "@/components/providers/Providers";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { Select } from "@/components/ui/Select";
import { MesaChip } from "@/components/panel/mesas/MesaChip";
import { DayNavBtn } from "@/components/panel/mesas/DayNavBtn";
import {
  FREE_BRUSH,
  MESAS,
  tablesOfOwners,
  toneFor,
  uniqueIds,
} from "@/components/panel/mesas/jornadaUi";
import { firstName, formatTableRange } from "@/lib/floorShift";
import type { EmployeeUI } from "@/lib/store/config-store";

export const DayShiftModal = ({
  weekday,
  tramoLabel,
  owners,
  employees,
  empIds,
  mesas,
  brush,
  busy,
  onBrush,
  onMark,
  onShiftDay,
  onClose,
}: {
  weekday: number;
  tramoLabel: string;
  owners: Record<number, string>;
  employees: EmployeeUI[];
  empIds: string[];
  mesas: number[];
  brush: string;
  busy: boolean;
  onBrush: (id: string) => void;
  onMark: (n: number) => void;
  onShiftDay: (delta: -1 | 1) => void;
  onClose: () => void;
}) => {
  const { t } = useApp();
  const empName = (id: string) =>
    employees.find((e) => e.id === id)?.name ?? "";
  const assigned = uniqueIds(owners);
  const empOpts = [
    { value: FREE_BRUSH, label: t("recepcion.dejarLibre") },
    ...employees.map((e) => ({ value: e.id, label: e.name })),
  ];
  const canPaint = Boolean(brush);

  return (
    <ModalShell onClose={onClose} labelledBy="jornada-dia-title" wide>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="jornada-dia-title"
            className="font-display text-2xl uppercase tracking-tight text-carbon"
          >
            {t(`recepcion.dia.${weekday}`)}
          </h2>
          <p className="mt-1 text-sm text-carbon/55">
            {tramoLabel}
            {" · "}
            {t("recepcion.elegirQuienDia")}
          </p>
        </div>
        <ModalCloseBtn onClick={onClose} label={t("mesa.cerrar")} />
      </div>

      <p className="text-xs font-semibold uppercase tracking-wide text-carbon/50">
        {t("recepcion.enEsteDia")}
      </p>
      {assigned.length ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {assigned.map((id) => (
            <li key={id} className="flex items-center gap-3">
              <span
                className={`size-7 shrink-0 rounded-full ${toneFor(id, empIds)}`}
              />
              <span className="text-base font-bold text-carbon">
                {empName(id)}
              </span>
              <span className="ml-auto text-sm tabular-nums text-carbon/55">
                {formatTableRange(tablesOfOwners(owners, id)) || "—"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-carbon/50">{t("recepcion.sinPlantilla")}</p>
      )}

      {employees.length ? (
        <label className="mt-5 flex flex-col gap-1 text-xs font-semibold text-carbon/55">
          {t("recepcion.marcarCon")}
          <Select
            value={brush}
            onChange={onBrush}
            placeholder="—"
            className="w-full"
            triggerClassName="min-h-11 w-full"
            ariaLabel={t("recepcion.marcarCon")}
            options={empOpts}
          />
        </label>
      ) : (
        <p className="mt-5 text-sm text-carbon/55">{t("recepcion.sinEmpleados")}</p>
      )}
      {brush === FREE_BRUSH ? (
        <p className="mt-2 text-sm font-semibold text-carbon">
          {t("recepcion.marcandoLibre")}
        </p>
      ) : brush ? (
        <p className="mt-2 text-sm font-semibold text-carbon">
          {t("recepcion.marcando", { n: firstName(empName(brush)) || empName(brush) })}
        </p>
      ) : null}

      {mesas.length > 0 ? (
        <>
          <div className="mt-5 flex items-center justify-center gap-3">
            <DayNavBtn
              dir="prev"
              label={t("recepcion.diaAnterior")}
              onClick={() => onShiftDay(-1)}
            />
            <p className="min-w-[8rem] text-center font-display text-xl uppercase tracking-tight text-carbon">
              {t(`recepcion.dia.${weekday}`)}
            </p>
            <DayNavBtn
              dir="next"
              label={t("recepcion.diaSiguiente")}
              onClick={() => onShiftDay(1)}
            />
          </div>
          <p className="mt-3 text-center text-xs font-semibold uppercase tracking-wide text-carbon/50">
            {t("recepcion.todasLasMesas")}
          </p>
          <div className={`mt-2 ${MESAS}`}>
            {mesas.map((n) => {
              const owner = owners[n] || null;
              return (
                <MesaChip
                  key={n}
                  n={n}
                  employeeId={owner}
                  empIds={empIds}
                  name={owner ? firstName(empName(owner)) : ""}
                  disabled={busy}
                  onClick={canPaint ? () => onMark(n) : undefined}
                />
              );
            })}
          </div>
        </>
      ) : null}
    </ModalShell>
  );
};
