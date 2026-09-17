import { WEEKDAYS } from "@/lib/floorShift";
import { DOT_MAX, uniqueIds } from "@/components/panel/mesas/jornadaUi";
import { EmpDots } from "@/components/panel/mesas/EmpDots";

export const WeekCalendar = ({
  selected,
  empIds,
  ownersOf,
  onSelectDay,
  dayLabel,
}: {
  selected: number | null;
  empIds: string[];
  ownersOf: (d: number) => Record<number, string>;
  onSelectDay: (d: number) => void;
  dayLabel: (d: number) => string;
}) => (
  <div className="grid grid-cols-7 gap-1">
    {WEEKDAYS.map((d) => {
      const ids = uniqueIds(ownersOf(d));
      const active = selected === d;
      return (
        <button
          key={d}
          type="button"
          onClick={() => onSelectDay(d)}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl border-2 px-0.5 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide ${
            active
              ? "border-marca bg-marca/15 text-carbon"
              : "border-linea text-carbon/70 hover:border-carbon/25"
          }`}
        >
          {dayLabel(d)}
          <EmpDots ids={ids} empIds={empIds} max={DOT_MAX} />
        </button>
      );
    })}
  </div>
);
