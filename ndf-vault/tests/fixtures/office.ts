import { crc32, deflateRawSync } from "node:zlib";

/**
 * Real Office containers for the tests: ZIP archives with the parts Word,
 * Excel and PowerPoint write, compressed the way they compress them.
 */

export interface Part {
  name: string;
  data: string | Buffer;
  /** Store without compression. */
  stored?: boolean;
}

export function zipBuffer(parts: Part[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const part of parts) {
    const name = Buffer.from(part.name, "utf8");
    const raw = typeof part.data === "string" ? Buffer.from(part.data, "utf8") : part.data;
    const packed = part.stored ? raw : deflateRawSync(raw);
    const method = part.stored ? 0 : 8;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt32LE(crc32(raw), 16);
    dir.writeUInt32LE(packed.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    chunks.push(local, name, packed);
    central.push(dir, name);
    offset += 30 + name.length + packed.length;
  }
  const dirSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(dirSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, ...central, end]);
}

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const TYPES: Part = { name: "[Content_Types].xml", data: `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>` };

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* --------------------------------------------------------------------- Word */

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

/** One Word paragraph. `style` is a style id ("Titre1"); `props` is raw run-property XML ("<w:b/>"). */
export const para = (text: string, options: { style?: string; props?: string; list?: boolean; align?: string } = {}) =>
  `<w:p><w:pPr>${options.style ? `<w:pStyle w:val="${options.style}"/>` : ""}${options.list ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ""}${options.align ? `<w:jc w:val="${options.align}"/>` : ""}</w:pPr><w:r>${options.props ? `<w:rPr>${options.props}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;

export const table = (rows: string[][]) => `<w:tbl>${rows.map((r) => `<w:tr>${r.map((c) => `<w:tc>${para(c)}</w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>`;

/** Word names its heading styles in the language it runs in: here the French ids, as a French Word writes them. */
export const DOCX_STYLES = `${HEAD}<w:styles ${W}><w:style w:type="paragraph" w:styleId="Titre1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Titre2"><w:name w:val="heading 2"/></w:style><w:style w:type="paragraph" w:styleId="Clause"><w:name w:val="Clause"/><w:basedOn w:val="Titre2"/></w:style></w:styles>`;

export function docx(body: string, extra: Part[] = []): Buffer {
  return zipBuffer([TYPES, { name: "word/document.xml", data: `${HEAD}<w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>` }, { name: "word/styles.xml", data: DOCX_STYLES }, ...extra]);
}

/* -------------------------------------------------------------------- Excel */

export type Cell = string | number | boolean | null | { v: number; s: number } | { f: string; v: string | number };

export interface SheetSpec {
  name: string;
  rows: Cell[][];
  hidden?: boolean;
}

const colName = (i: number) => {
  let out = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
  return out;
};

/** Cell styles used by the fixtures: 0 general, 1 date (built-in 14), 2 percent (built-in 10), 3 custom date-time. */
const XLSX_STYLES = `${HEAD}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd\\ hh:mm"/></numFmts><cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="10"/><xf numFmtId="164"/></cellXfs></styleSheet>`;

export function xlsx(sheets: SheetSpec[], options: { date1904?: boolean; extra?: Part[] } = {}): Buffer {
  const strings: string[] = [];
  const shared = (s: string) => {
    let i = strings.indexOf(s);
    if (i < 0) i = strings.push(s) - 1;
    return i;
  };
  const sheetXml = (rows: Cell[][]) =>
    `${HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
      .map((row, r) => {
        const cells = row
          .map((cell, c) => {
            const ref = `${colName(c)}${r + 1}`;
            if (cell === null) return "";
            if (typeof cell === "string") return `<c r="${ref}" t="s"><v>${shared(cell)}</v></c>`;
            if (typeof cell === "number") return `<c r="${ref}"><v>${cell}</v></c>`;
            if (typeof cell === "boolean") return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`;
            if ("f" in cell) return typeof cell.v === "number" ? `<c r="${ref}"><f>${esc(cell.f)}</f><v>${cell.v}</v></c>` : `<c r="${ref}" t="str"><f>${esc(cell.f)}</f><v>${esc(cell.v)}</v></c>`;
            return `<c r="${ref}" s="${cell.s}"><v>${cell.v}</v></c>`;
          })
          .join("");
        // Like Excel, leave out rows that hold nothing.
        return cells ? `<row r="${r + 1}">${cells}</row>` : "";
      })
      .join("")}</sheetData></worksheet>`;
  const parts = sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.rows) }));
  const workbook = `${HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${options.date1904 ? '<workbookPr date1904="1"/>' : ""}<sheets>${sheets
    .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}"${s.hidden ? ' state="hidden"' : ""} r:id="rId${i + 1}"/>`)
    .join("")}</sheets></workbook>`;
  const rels = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
    .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
    .join("")}</Relationships>`;
  const sst = `${HEAD}<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join("")}</sst>`;
  return zipBuffer([TYPES, { name: "xl/workbook.xml", data: workbook }, { name: "xl/_rels/workbook.xml.rels", data: rels }, { name: "xl/styles.xml", data: XLSX_STYLES }, { name: "xl/sharedStrings.xml", data: sst }, ...parts, ...(options.extra ?? [])]);
}

/* --------------------------------------------------------------- PowerPoint */

export interface SlideSpec {
  title?: string;
  lines?: (string | { text: string; level: number })[];
  notes?: string;
  hidden?: boolean;
}

const P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const shape = (kind: string, paragraphs: string) => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="x"/><p:cNvSpPr/><p:nvPr><p:ph type="${kind}"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${paragraphs}</p:txBody></p:sp>`;
const line = (text: string, level = 0) => `<a:p>${level ? `<a:pPr lvl="${level}"/>` : ""}<a:r><a:rPr lang="fr-CA"/><a:t>${esc(text)}</a:t></a:r></a:p>`;

export function pptx(slides: SlideSpec[], extra: Part[] = []): Buffer {
  const parts: Part[] = [];
  // Files are numbered in the order they were created, which is not the order of the show: the last slide is slide1.xml.
  const fileOf = (i: number) => slides.length - i;
  slides.forEach((s, i) => {
    const n = fileOf(i);
    const body = (s.title !== undefined ? shape("title", line(s.title)) : "") + shape("body", (s.lines ?? []).map((l) => (typeof l === "string" ? line(l) : line(l.text, l.level))).join(""));
    parts.push({ name: `ppt/slides/slide${n}.xml`, data: `${HEAD}<p:sld ${P}${s.hidden ? ' show="0"' : ""}><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>${body}</p:spTree></p:cSld></p:sld>` });
    if (s.notes !== undefined) {
      parts.push({
        name: `ppt/slides/_rels/slide${n}.xml.rels`,
        data: `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${n}.xml"/></Relationships>`,
      });
      parts.push({ name: `ppt/notesSlides/notesSlide${n}.xml`, data: `${HEAD}<p:notes ${P}><p:cSld><p:spTree>${shape("sldImg", "")}${shape("body", line(s.notes))}${shape("sldNum", line("3"))}</p:spTree></p:cSld></p:notes>` });
    }
  });
  const presentation = `${HEAD}<p:presentation ${P}><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join("")}</p:sldIdLst></p:presentation>`;
  const rels = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides
    .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${fileOf(i)}.xml"/>`)
    .join("")}</Relationships>`;
  return zipBuffer([TYPES, { name: "ppt/presentation.xml", data: presentation }, { name: "ppt/_rels/presentation.xml.rels", data: rels }, ...parts, ...extra]);
}
