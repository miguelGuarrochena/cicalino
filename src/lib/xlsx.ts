/* Reads the first sheet of an .xlsx file into rows of strings.
 *
 * An .xlsx is a zip with XML inside. The zip is walked from its central
 * directory; deflated entries go through DecompressionStream("deflate-raw"),
 * which browsers and Node 18+ ship, so there's no spreadsheet dependency for
 * something this narrow. Only what a menu import needs is read: shared and
 * inline strings, numbers and booleans. Formulas come back as their cached
 * value. The old binary .xls format isn't a zip and is rejected.
 */

export class XlsxError extends Error {}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

type Entry = { name: string; method: number; size: number; offset: number };

const readEntries = (view: DataView): Entry[] => {
  let eocd = -1;
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65_557); i--) {
    if (view.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new XlsxError("not-zip");

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: Entry[] = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== CENTRAL) throw new XlsxError("corrupt");
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const name = decoder.decode(new Uint8Array(view.buffer, view.byteOffset + p + 46, nameLen));
    entries.push({ name, method, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
};

const inflate = async (data: Uint8Array): Promise<Uint8Array> => {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const readEntry = async (view: DataView, e: Entry): Promise<string> => {
  if (view.getUint32(e.offset, true) !== LOCAL) throw new XlsxError("corrupt");
  const nameLen = view.getUint16(e.offset + 26, true);
  const extraLen = view.getUint16(e.offset + 28, true);
  const start = view.byteOffset + e.offset + 30 + nameLen + extraLen;
  const raw = new Uint8Array(view.buffer, start, e.size);
  const bytes = e.method === 0 ? raw : e.method === 8 ? await inflate(raw) : null;
  if (!bytes) throw new XlsxError("unsupported-compression");
  return new TextDecoder().decode(bytes);
};

const decodeXml = (s: string): string =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");

/* All <t> runs inside a fragment, joined (rich text splits one cell in runs). */
const textRuns = (xml: string): string =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1] ?? "")).join("");

const columnIndex = (ref: string): number => {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/* Which part holds the first sheet: workbook.xml names it, its rels file
 * points to the part. Falls back to the conventional path. */
const firstSheetPath = (workbook: string | null, rels: string | null): string => {
  const rid = workbook?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  if (rid && rels) {
    const rel = [...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)]
      .map((m) => m[1] ?? "")
      .find((attrs) => attrs.includes(`Id="${rid}"`));
    const target = rel?.match(/Target="([^"]+)"/)?.[1];
    if (target) return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  return "xl/worksheets/sheet1.xml";
};

export const readXlsx = async (buffer: ArrayBuffer): Promise<string[][]> => {
  const view = new DataView(buffer);
  const entries = readEntries(view);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const read = async (name: string) => {
    const e = byName.get(name);
    return e ? readEntry(view, e) : null;
  };

  const [workbook, rels, shared] = await Promise.all([
    read("xl/workbook.xml"),
    read("xl/_rels/workbook.xml.rels"),
    read("xl/sharedStrings.xml"),
  ]);
  const sheet = await read(firstSheetPath(workbook, rels));
  if (!sheet) throw new XlsxError("no-sheet");

  const strings = shared
    ? [...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textRuns(m[1] ?? ""))
    : [];

  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of (rowMatch[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1] ?? "";
      const body = c[2] ?? "";
      const ref = attrs.match(/\br="([^"]+)"/)?.[1];
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const idx = ref ? columnIndex(ref) : cells.length;
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = "";
      if (type === "s") value = strings[Number(v)] ?? "";
      else if (type === "inlineStr") value = textRuns(body);
      else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
      else if (v != null) value = decodeXml(v);
      while (cells.length < idx) cells.push("");
      cells[idx] = value.trim();
    }
    if (cells.some((cell) => cell !== "")) rows.push(cells);
  }
  return rows;
};

/* Zip files start with "PK\x03\x04". */
export const looksLikeZip = (bytes: Uint8Array): boolean =>
  bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

/* Old binary Excel (.xls) starts with the OLE2 signature. */
export const looksLikeLegacyXls = (bytes: Uint8Array): boolean =>
  bytes.length > 3 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
