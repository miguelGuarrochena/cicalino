export type MenuImportColumn =
  | "category"
  | "name"
  | "description"
  | "price"
  | "cost"
  | "skip";

export type MenuImportRow = {
  category: string;
  name: string;
  description: string;
  price: number | null;
  cost: number | null;
  error: string | null;
};

export type MenuImportDraft = {
  headers: string[];
  mapping: MenuImportColumn[];
  rows: string[][];
};

const ALIASES: Record<Exclude<MenuImportColumn, "skip">, string[]> = {
  category: ["categoria", "categoría", "category", "cat", "seccion", "sección"],
  name: ["producto", "product", "nombre", "name", "item", "plato"],
  description: ["descripcion", "descripción", "description", "desc", "detalle"],
  price: ["precio", "price", "venta", "sale", "importe"],
  cost: ["costo", "cost", "coste", "costo interno"],
};

const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const guessColumn = (header: string): MenuImportColumn => {
  const h = norm(header);
  for (const [col, aliases] of Object.entries(ALIASES) as [
    Exclude<MenuImportColumn, "skip">,
    string[],
  ][]) {
    if (aliases.some((a) => h === a || h.includes(a))) return col;
  }
  return "skip";
};

const splitLine = (line: string, delim: string): string[] => {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (ch === delim && !quoted) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
};

export const detectDelimiter = (text: string): string => {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const counts = [",", ";", "\t"].map((d) => ({
    d,
    n: splitLine(first, d).filter(Boolean).length,
  }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0]?.n ? counts[0].d : ",";
};

export const parseDelimited = (text: string): string[][] => {
  const clean = text.replace(/^\uFEFF/, "");
  const delim = detectDelimiter(clean);
  return clean
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0)
    .map((l) => splitLine(l, delim));
};

export const isSpreadsheetBinary = (file: File, text: string): boolean => {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
    return false;
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return true;
  return text.startsWith("PK") || file.type.includes("spreadsheet");
};

export const draftFromTable = (table: string[][]): MenuImportDraft | null => {
  const headers = table[0];
  if (!headers || headers.length < 2) return null;
  const mapping = headers.map(guessColumn);
  if (!mapping.includes("name") || !mapping.includes("price")) {
    const nameIdx = mapping.findIndex((c) => c === "name");
    const priceIdx = mapping.findIndex((c) => c === "price");
    if (nameIdx < 0 && headers[0]) mapping[0] = "name";
    if (priceIdx < 0 && headers[1]) mapping[1] = mapping[1] === "name" ? "price" : mapping[1] || "price";
    if (!mapping.includes("price") && headers.length > 1) {
      const free = mapping.findIndex((c, i) => c === "skip" && i > 0);
      if (free >= 0) mapping[free] = "price";
    }
  }
  return { headers, mapping, rows: table.slice(1) };
};

const money = (raw: string): number | null => {
  const s = raw.replace(/\s/g, "").replace(/\$/g, "");
  if (!s) return null;
  const normalized = s.includes(",") && !s.includes(".")
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(/,/g, "");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
};

export const applyMapping = (draft: MenuImportDraft): MenuImportRow[] => {
  const idx = (col: MenuImportColumn) => draft.mapping.indexOf(col);
  const iCat = idx("category");
  const iName = idx("name");
  const iDesc = idx("description");
  const iPrice = idx("price");
  const iCost = idx("cost");
  return draft.rows.map((cells) => {
    const name = (iName >= 0 ? cells[iName] : "")?.trim() ?? "";
    const category = (iCat >= 0 ? cells[iCat] : "")?.trim() ?? "";
    const description = (iDesc >= 0 ? cells[iDesc] : "")?.trim() ?? "";
    const price = iPrice >= 0 ? money(cells[iPrice] ?? "") : null;
    const cost = iCost >= 0 ? money(cells[iCost] ?? "") : null;
    let error: string | null = null;
    if (!name) error = "Falta el nombre.";
    else if (name.length > 80) error = "El nombre es demasiado largo.";
    else if (price == null || price < 1 || price > 10_000_000) {
      error = "El precio tiene que ser un número mayor a 0.";
    } else if (cost != null && (cost < 0 || cost > 10_000_000)) {
      error = "El costo no es válido.";
    } else if (category.length > 40) error = "La categoría es demasiado larga.";
    else if (description.length > 200) error = "La descripción es demasiado larga.";
    return { category, name, description, price, cost, error };
  });
};

export const DEFAULT_MENU_CATEGORY_KEYS = [
  "entradas",
  "carnes",
  "pizzas",
  "pastas",
  "hamburguesas",
  "ensaladas",
  "bebidas",
  "postres",
] as const;
