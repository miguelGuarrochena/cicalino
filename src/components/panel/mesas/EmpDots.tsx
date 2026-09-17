import { toneFor } from "@/components/panel/mesas/jornadaUi";

export const EmpDots = ({
  ids,
  empIds,
  max = 5,
}: {
  ids: string[];
  empIds: string[];
  max?: number;
}) => {
  if (!ids.length) return null;
  const shown = ids.slice(0, max);
  const extra = ids.length - shown.length;
  return (
    <span className="flex min-h-[6px] flex-wrap items-center justify-center gap-0.5">
      {shown.map((id) => (
        <span
          key={id}
          className={`size-1.5 rounded-full ${toneFor(id, empIds)}`}
        />
      ))}
      {extra > 0 ? (
        <span className="text-[9px] font-bold leading-none text-carbon/55">
          +{extra}
        </span>
      ) : null}
    </span>
  );
};
