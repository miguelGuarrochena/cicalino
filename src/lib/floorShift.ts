/* Floor shift: weekly template vs today's effective assignment.
 *
 * The database is the authority (supabase/mesa-asignacion-jornada.sql).
 * These helpers expand ranges the same way the RPC does, so the editor can
 * reject overlaps before saving. */

export type FloorTramo = "manana" | "noche";

export interface TemplateRange {
  id?: string;
  weekday: number;
  employeeId: string;
  employeeName: string;
  from: number;
  to: number;
  tramo?: FloorTramo;
}

export interface TableAssignment {
  tableNumber: number;
  employeeId: string | null;
  employeeName: string | null;
  tramo?: FloorTramo;
}

export interface ShiftDay {
  date: string;
  weekday: number;
  assignments: TableAssignment[];
  template: TemplateRange[];
  turnosPiso: 1 | 2;
}

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const NIGHT_FROM_HOUR = 17;

export const parseTramo = (v: unknown): FloorTramo =>
  v === "noche" ? "noche" : "manana";

export const currentFloorTramo = (
  turnosPiso: 1 | 2,
  hour = new Date().getHours(),
): FloorTramo => {
  if (turnosPiso !== 2) return "manana";
  return hour >= NIGHT_FROM_HOUR ? "noche" : "manana";
};

export const assignmentsForTramo = (
  rows: TableAssignment[],
  tramo: FloorTramo,
): TableAssignment[] => rows.filter((r) => (r.tramo ?? "manana") === tramo);

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

export const tablesInRange = (from: number, to: number): number[] => {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1) {
    return [];
  }
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  const out: number[] = [];
  for (let n = a; n <= b; n += 1) out.push(n);
  return out;
};

export const nextFreeRange = (
  tableCount: number,
  taken: { from: number; to: number }[],
): { from: number; to: number } | null => {
  if (!(tableCount >= 1)) return null;
  const used = new Set<number>();
  for (const r of taken) {
    for (const n of tablesInRange(r.from, r.to)) used.add(n);
  }
  let start: number | null = null;
  for (let n = 1; n <= tableCount; n += 1) {
    if (used.has(n)) {
      if (start != null) return { from: start, to: n - 1 };
      continue;
    }
    if (start == null) start = n;
  }
  return start == null ? null : { from: start, to: tableCount };
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

export const ownersFromTemplate = (
  template: TemplateRange[],
  weekday: number,
  tramo: FloorTramo,
): Record<number, string> => {
  const out: Record<number, string> = {};
  for (const p of template) {
    if (p.weekday !== weekday) continue;
    if ((p.tramo ?? "manana") !== tramo) continue;
    if (!p.employeeId) continue;
    for (const n of tablesInRange(p.from, p.to)) out[n] = p.employeeId;
  }
  return out;
};

export const rangesFromOwners = (
  owners: Record<number, string>,
): { employeeId: string; from: number; to: number }[] => {
  const byEmp = new Map<string, number[]>();
  for (const [raw, id] of Object.entries(owners)) {
    if (!id) continue;
    const n = Number(raw);
    if (!Number.isInteger(n)) continue;
    const list = byEmp.get(id) ?? [];
    list.push(n);
    byEmp.set(id, list);
  }
  const out: { employeeId: string; from: number; to: number }[] = [];
  for (const [employeeId, tables] of byEmp) {
    for (const r of compactRanges(tables)) {
      out.push({ employeeId, from: r.from, to: r.to });
    }
  }
  return out.sort((a, b) => a.from - b.from || a.employeeId.localeCompare(b.employeeId));
};
