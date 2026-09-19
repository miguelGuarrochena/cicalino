import { WEEKDAYS, tablesInRange, type FloorTramo } from "@/lib/floorShift";

export const BTN =
  "min-h-11 w-full rounded-full px-4 text-sm font-semibold disabled:opacity-50 sm:w-auto";
export const MESAS =
  "grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8";
export const CHIP =
  "relative flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-2xl px-0.5 text-center";
export const EMP_TONE = [
  "bg-marca text-crema",
  "bg-espera text-crema",
  "bg-curso text-crema",
  "bg-carbon text-crema",
  "bg-[#5b4a8a] text-crema",
  "bg-marca/65 text-crema",
];
export const FREE_BRUSH = "__libre__";
export const DOT_MAX = 5;

export const allMesas = (count: number) =>
  Array.from({ length: Math.max(0, count) }, (_, i) => i + 1);

export const toneFor = (employeeId: string | null | undefined, ids: string[]) => {
  if (!employeeId) {
    return "bg-surface text-carbon/65 ring-1 ring-dashed ring-linea";
  }
  const i = Math.max(0, ids.indexOf(employeeId));
  return EMP_TONE[i % EMP_TONE.length];
};

export const uniqueIds = (owners: Record<number, string>): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of Object.values(owners)) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
};

export const tablesOfOwners = (
  owners: Record<number, string>,
  employeeId: string,
): number[] =>
  Object.entries(owners)
    .filter(([, id]) => id === employeeId)
    .map(([n]) => Number(n))
    .sort((a, b) => a - b);

export const parseRange = (from: string, to: string) => {
  const a = Number(from);
  const b = Number(to);
  return { a, b, tables: tablesInRange(a, b) };
};

export const draftKey = (tramo: FloorTramo, d: number) => `${tramo}-${d}`;

/** Inclusive weekday span on the Lun–Dom template. Wraps (Vie→Lun). */
export const weekdaysInSpan = (from: number, to: number): number[] => {
  const days = WEEKDAYS as readonly number[];
  const a = days.includes(from) ? from : 1;
  const b = days.includes(to) ? to : 7;
  const out: number[] = [];
  let d = a;
  while (out.length < 7) {
    out.push(d);
    if (d === b) break;
    d = d === 7 ? 1 : d + 1;
  }
  return out;
};

export const weekdayFromOffset = (weekday: number, offset: number): number => {
  const base = weekday >= 1 && weekday <= 7 ? weekday : 1;
  return ((((base - 1 + offset) % 7) + 7) % 7) + 1;
};
