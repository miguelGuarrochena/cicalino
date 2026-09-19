import { WEEKDAYS } from "@/lib/floorShift";
import { DOT_MAX, uniqueIds } from "@/components/panel/mesas/jornadaUi";
import { EmpDots } from "@/components/panel/mesas/EmpDots";

export const WeekCalendar = ({
  selected,
  empIds,
  ownersOf,
  onSelectDay,
  dayLabel,
  isClosed,
  closedLabel,
}: {
  selected: number | null;
  empIds: string[];
  ownersOf: (d: number) => Record<number, string>;
  onSelectDay: (d: number) => void;
  dayLabel: (d: number) => string;
  isClosed: (d: number) => boolean;
  closedLabel: string;
}) => (
  <div className="grid grid-cols-7 gap-1">
    {WEEKDAYS.map((d) => {
      /* Un día cerrado no se asigna: no hay servicio que repartir. Queda a la
       * vista igual, apagado, para que se entienda que el local cierra ese
       * día y no que la plantilla quedó a medio hacer. */
      const cerrado = isClosed(d);
      const ids = cerrado ? [] : uniqueIds(ownersOf(d));
      const active = selected === d;
      return (
        <button
          key={d}
          type="button"
          onClick={() => onSelectDay(d)}
          disabled={cerrado}
          title={cerrado ? closedLabel : undefined}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl border-2 px-0.5 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide ${
            cerrado
              ? "border-dashed border-linea bg-crema/40 text-carbon/30"
              : active
                ? "border-marca bg-marca/15 text-carbon"
                : "border-linea text-carbon/70 hover:border-carbon/25"
          }`}
        >
          <span className={cerrado ? "line-through" : undefined}>
            {dayLabel(d)}
          </span>
          {cerrado ? (
            <span className="text-[9px] font-semibold tracking-tight">
              {closedLabel}
            </span>
          ) : (
            <EmpDots ids={ids} empIds={empIds} max={DOT_MAX} />
          )}
        </button>
      );
    })}
  </div>
);
