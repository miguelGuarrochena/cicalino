"use client";

import { useState } from "react";
import { useApp } from "@/components/providers/Providers";
import { ModalShell } from "@/components/ui/ModalShell";
import { ModalCloseBtn } from "@/components/ui/ModalCloseBtn";
import { Select, type SelectOption } from "@/components/ui/Select";
import { BTN, parseRange } from "@/components/panel/mesas/jornadaUi";

export const RangeAssignModal = ({
  scope,
  employees,
  mesaOpts,
  dayOpts,
  defaultEmp,
  defaultDayFrom,
  defaultDayTo,
  defaultMesaFrom,
  defaultMesaTo,
  busy,
  onClose,
  onAssign,
}: {
  scope: "today" | "week";
  employees: SelectOption[];
  mesaOpts: SelectOption[];
  dayOpts: SelectOption[];
  defaultEmp: string;
  defaultDayFrom: string;
  defaultDayTo: string;
  defaultMesaFrom: string;
  defaultMesaTo: string;
  busy: boolean;
  onClose: () => void;
  onAssign: (payload: {
    employeeId: string;
    dayFrom: number;
    dayTo: number;
    mesaFrom: number;
    mesaTo: number;
  }) => void;
}) => {
  const { t } = useApp();
  const [emp, setEmp] = useState(defaultEmp);
  const [dayFrom, setDayFrom] = useState(defaultDayFrom);
  const [dayTo, setDayTo] = useState(defaultDayTo);
  const [mesaFrom, setMesaFrom] = useState(defaultMesaFrom);
  const [mesaTo, setMesaTo] = useState(defaultMesaTo);
  const tables = parseRange(mesaFrom, mesaTo).tables;
  const canSubmit = Boolean(emp && tables.length);

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="jornada-rango-title"
      footer={
        <button
          type="button"
          disabled={busy || !canSubmit}
          onClick={() =>
            onAssign({
              employeeId: emp,
              dayFrom: Number(dayFrom),
              dayTo: Number(dayTo),
              mesaFrom: Number(mesaFrom),
              mesaTo: Number(mesaTo),
            })
          }
          className={`${BTN} bg-marca text-crema`}
        >
          {t("recepcion.asignar")}
        </button>
      }
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2
          id="jornada-rango-title"
          className="font-display text-2xl uppercase tracking-tight text-carbon"
        >
          {t("recepcion.asignarRango")}
        </h2>
        <ModalCloseBtn onClick={onClose} label={t("mesa.cerrar")} />
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-carbon/55">
          {t("recepcion.atiende")}
          <Select
            value={emp}
            onChange={setEmp}
            placeholder="—"
            className="w-full"
            triggerClassName="min-h-11 w-full"
            ariaLabel={t("recepcion.atiende")}
            options={employees}
          />
        </label>

        {scope === "week" ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-carbon/55">
              {t("recepcion.desde")}
              <Select
                value={dayFrom}
                onChange={setDayFrom}
                className="w-full"
                triggerClassName="min-h-11 w-full"
                ariaLabel={t("recepcion.desde")}
                options={dayOpts}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-carbon/55">
              {t("recepcion.hasta")}
              <Select
                value={dayTo}
                onChange={setDayTo}
                className="w-full"
                triggerClassName="min-h-11 w-full"
                ariaLabel={t("recepcion.hasta")}
                options={dayOpts}
              />
            </label>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-carbon/55">
            {t("recepcion.mesaDesde")}
            <Select
              value={mesaFrom}
              onChange={(v) => {
                setMesaFrom(v);
                if (Number(v) > Number(mesaTo)) setMesaTo(v);
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
              value={mesaTo}
              onChange={(v) => {
                setMesaTo(v);
                if (Number(v) < Number(mesaFrom)) setMesaFrom(v);
              }}
              className="w-full"
              triggerClassName="min-h-11 w-full"
              ariaLabel={t("recepcion.mesaHasta")}
              options={mesaOpts}
            />
          </label>
        </div>
      </div>
    </ModalShell>
  );
};
