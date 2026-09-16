/* Floor shift: weekly template vs today's effective assignment.
 *
 * The database is the authority (supabase/mesa-asignacion-jornada.sql).
 * These helpers expand ranges the same way the RPC does, so the editor can
 * reject overlaps before saving. */

export interface TemplateRange {
  id?: string;
  weekday: number;
  employeeId: string;
  employeeName: string;
  from: number;
  to: number;
}

export interface TableAssignment {
  tableNumber: number;
  employeeId: string | null;
  employeeName: string | null;
}

export interface ShiftDay {
  date: string;
  weekday: number;
  assignments: TableAssignment[];
  template: TemplateRange[];
}

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const rangesOverlap = (
  rows: { from: number; to: number }[],
): boolean => {
  const taken = new Set<number>();
  for (const r of rows) {
    if (!(r.from >= 1) || r.to < r.from) return true;
    for (let n = r.from; n <= r.to; n += 1) {
      if (taken.has(n)) return true;
      taken.add(n);
    }
  }
  return false;
};

export const assignmentByTable = (
  rows: TableAssignment[],
): Map<number, TableAssignment> => {
  const out = new Map<number, TableAssignment>();
  for (const r of rows) out.set(r.tableNumber, r);
  return out;
};

export const tablesOfEmployee = (
  rows: TableAssignment[],
  employeeId: string,
): number[] =>
  rows
    .filter((r) => r.employeeId === employeeId)
    .map((r) => r.tableNumber)
    .sort((a, b) => a - b);

export const unassignedTables = (
  tableCount: number,
  rows: TableAssignment[],
): number[] => {
  const taken = new Set(
    rows.filter((r) => r.employeeId).map((r) => r.tableNumber),
  );
  const out: number[] = [];
  for (let n = 1; n <= tableCount; n += 1) {
    if (!taken.has(n)) out.push(n);
  }
  return out;
};

export const compactRanges = (tables: number[]): { from: number; to: number }[] => {
  const sorted = [...new Set(tables)].sort((a, b) => a - b);
  if (!sorted.length) return [];
  const out: { from: number; to: number }[] = [];
  let from = sorted[0]!;
  let prev = sorted[0]!;
  for (const n of sorted.slice(1)) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    out.push({ from, to: prev });
    from = n;
    prev = n;
  }
  out.push({ from, to: prev });
  return out;
};

export const formatTableRange = (tables: number[]): string =>
  compactRanges(tables)
    .map((r) => (r.from === r.to ? String(r.from) : `${r.from}–${r.to}`))
    .join(", ");

export interface StaffShift {
  id: string;
  name: string;
  tables: number[];
}

export const staffOnShift = (rows: TableAssignment[]): StaffShift[] => {
  const map = new Map<string, StaffShift>();
  for (const r of rows) {
    if (!r.employeeId) continue;
    const cur = map.get(r.employeeId) ?? {
      id: r.employeeId,
      name: r.employeeName ?? "",
      tables: [],
    };
    cur.tables.push(r.tableNumber);
    if (r.employeeName) cur.name = r.employeeName;
    map.set(r.employeeId, cur);
  }
  return [...map.values()]
    .map((s) => ({ ...s, tables: [...s.tables].sort((a, b) => a - b) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
};

export const firstName = (name: string | null | undefined): string => {
  const n = (name ?? "").trim();
  if (!n) return "";
  return n.split(/\s+/)[0] ?? n;
};
