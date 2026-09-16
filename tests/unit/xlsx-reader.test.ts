import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import { looksLikeLegacyXls, looksLikeZip, readXlsx, XlsxError } from "@/lib/xlsx";
import { applyMapping, draftFromTable } from "@/lib/menuImport";

/* A minimal but real .xlsx: zip container, deflated parts, shared strings,
 * an inline string and numeric cells, like Excel and Google Sheets write. */
const zip = (files: Record<string, string>, store: string[] = []): ArrayBuffer => {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content, "utf8");
    const stored = store.includes(name);
    const data = stored ? raw : deflateRawSync(raw);
    const nameBuf = Buffer.from(name, "utf8");
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(stored ? 0 : 8, 8);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    local.push(header, nameBuf, data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(stored ? 0 : 8, 10);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += header.length + nameBuf.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...local, cdBuf, eocd]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength);
};

const workbook = `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Carta" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const rels = `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/carta.xml"/></Relationships>`;
const shared = `<sst><si><t>Categoría</t></si><si><t>Producto</t></si><si><t>Descripción</t></si><si><t>Precio</t></si><si><t>Costo</t></si><si><t>Pizzas</t></si><si><r><t>Margherita</t></r><r><t xml:space="preserve"> &amp; albahaca</t></r></si></sst>`;
const sheet = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c></row>
<row r="2"><c r="A2" t="s"><v>5</v></c><c r="B2" t="s"><v>6</v></c><c r="C2" t="inlineStr"><is><t>Tomate, mozzarella</t></is></c><c r="D2"><v>12000</v></c><c r="E2"><v>4500</v></c></row>
<row r="3"><c r="A3" t="s"><v>5</v></c><c r="B3" t="inlineStr"><is><t>Napolitana</t></is></c><c r="D3" t="str"><v>14.000</v></c></row>
<row r="4"></row>
</sheetData></worksheet>`;

describe("Menú — leer Excel (.xlsx)", () => {
  it("lee la primera hoja con textos compartidos, texto inline, números y celdas vacías", async () => {
    const buf = zip({
      "[Content_Types].xml": "<Types/>",
      "xl/workbook.xml": workbook,
      "xl/_rels/workbook.xml.rels": rels,
      "xl/sharedStrings.xml": shared,
      "xl/worksheets/carta.xml": sheet,
    }, ["[Content_Types].xml"]);
    expect(looksLikeZip(new Uint8Array(buf.slice(0, 4)))).toBe(true);
    const rows = await readXlsx(buf);
    expect(rows).toEqual([
      ["Categoría", "Producto", "Descripción", "Precio", "Costo"],
      ["Pizzas", "Margherita & albahaca", "Tomate, mozzarella", "12000", "4500"],
      ["Pizzas", "Napolitana", "", "14.000"],
    ]);
    const mapped = applyMapping(draftFromTable(rows)!);
    expect(mapped[0]).toMatchObject({ category: "Pizzas", name: "Margherita & albahaca", price: 12000, cost: 4500, error: null });
    expect(mapped[1]).toMatchObject({ name: "Napolitana", price: 14000, cost: null, error: null });
  });

  it("sin workbook.xml usa la hoja convencional", async () => {
    const buf = zip({
      "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row><c t="inlineStr"><is><t>Producto</t></is></c><c t="inlineStr"><is><t>Precio</t></is></c></row><row><c t="inlineStr"><is><t>Agua</t></is></c><c><v>2000</v></c></row></sheetData></worksheet>`,
    });
    expect(await readXlsx(buf)).toEqual([["Producto", "Precio"], ["Agua", "2000"]]);
  });

  it("rechaza archivos que no son .xlsx", async () => {
    await expect(readXlsx(new TextEncoder().encode("Producto,Precio\nAgua,2000").buffer)).rejects.toBeInstanceOf(XlsxError);
    expect(looksLikeLegacyXls(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toBe(true);
  });
});
