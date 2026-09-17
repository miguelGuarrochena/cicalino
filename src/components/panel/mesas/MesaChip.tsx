import { CHIP, toneFor } from "@/components/panel/mesas/jornadaUi";

export const MesaChip = ({
  n,
  employeeId,
  empIds,
  name,
  occupied = false,
  selected = false,
  disabled,
  onClick,
}: {
  n: number;
  employeeId: string | null;
  empIds: string[];
  name?: string;
  occupied?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) => {
  const cls = `${CHIP} ${toneFor(employeeId, empIds)} ${
    selected ? "ring-2 ring-marca ring-offset-2 ring-offset-surface" : ""
  } ${occupied ? "ring-2 ring-rose-600" : ""}`;
  const inner = (
    <>
      <span className="font-display text-lg leading-none">{n}</span>
      {name ? (
        <span className="line-clamp-2 max-w-full px-0.5 text-xs font-bold leading-tight">
          {name}
        </span>
      ) : null}
      {occupied ? (
        <span className="absolute right-1 top-1 size-2 rounded-full bg-rose-600" />
      ) : null}
    </>
  );
  if (!onClick) {
    return <div className={cls}>{inner}</div>;
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cls}
    >
      {inner}
    </button>
  );
};
