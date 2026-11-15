import { listZip, readZipText, ZipError, type ZipItem } from "./unzip";
import { attr, descendants, dig, kid, kids, parseXml, textOf, xmlTokens, type XmlNode } from "./xml";

/**
 * Readers for Word, Excel and PowerPoint files, for the preview.
 *
 * They extract what a reader needs to recognize a document: its text, its
 * headings, its tables, its sheets and its slides. Layout, images and charts
 * are not reproduced, and the preview says so. Nothing in the file is ever
 * executed or inserted as markup: everything that comes out is plain text.
 */

export type OfficeFormat = "docx" | "xlsx" | "pptx";

const MAIN_PART: Record<OfficeFormat, string> = { docx: "word/document.xml", xlsx: "xl/workbook.xml", pptx: "ppt/presentation.xml" };

/** With its article, as it reads in a sentence. */
export const OFFICE_LABEL: Record<OfficeFormat, string> = { docx: "un document Word", xlsx: "un classeur Excel", pptx: "une présentation PowerPoint" };

const has = (items: ZipItem[], name: string) => items.some((i) => i.name.toLowerCase() === name.toLowerCase());

export type OfficeVerdict = "ok" | "not-office" | "wrong-format" | "active-content";

/**
 * Is this ZIP really the Office document its extension claims, and is it
 * free of macros? Only the archive's table of contents is read.
 */
export async function inspectOffice(file: Blob, format: OfficeFormat): Promise<OfficeVerdict> {
  let items: ZipItem[];
  try {
    items = await listZip(file);
  } catch {
    return "not-office";
  }
  if (!has(items, "[Content_Types].xml")) return "not-office";
  // A macro-enabled file (.docm, .xlsm, .pptm) renamed to pass as a plain one, or ActiveX controls.
  if (items.some((i) => /(^|\/)vbaproject\.bin$/i.test(i.name) || /\/activex\//i.test(i.name))) return "active-content";
  if (has(items, MAIN_PART[format])) return "ok";
  return (Object.keys(MAIN_PART) as OfficeFormat[]).some((f) => has(items, MAIN_PART[f])) ? "wrong-format" : "not-office";
}

/** Why a preview could not be built, in terms the viewer can explain. */
export class OfficeError extends Error {
  constructor(public readonly reason: "too-large" | "unreadable") {
    super(reason);
    this.name = "OfficeError";
  }
}

/** The most a whole document may inflate to while its preview is built, all parts together. */
const MAX_DOCUMENT_BYTES = 96 * 1024 * 1024;

async function open(file: Blob): Promise<{ items: ZipItem[]; text: (name: string) => Promise<string | null> }> {
  try {
    const items = await listZip(file);
    // Each part has its own limit; this one stops a file made of many parts that each stay just under it.
    let budget = MAX_DOCUMENT_BYTES;
    const text = async (name: string) => {
      const item = items.find((i) => i.name.toLowerCase() === name.toLowerCase());
      if (item && item.size > budget) throw new OfficeError("too-large");
      const out = await readZipText(file, items, name);
      if (out !== null) budget -= item?.size ?? out.length;
      return out;
    };
    return { items, text };
  } catch (e) {
    throw new OfficeError(e instanceof ZipError && e.problem === "too-large" ? "too-large" : "unreadable");
  }
}

/** Run a reader, turning any low-level failure into an OfficeError. */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof OfficeError) throw e;
    throw new OfficeError(e instanceof ZipError && e.problem === "too-large" ? "too-large" : "unreadable");
  }
}

/** The relationship id an element points to ("r:id"), whatever prefix the file uses for it. */
function relId(node: XmlNode): string | undefined {
  for (const key in node.attrs) if (key.includes(":") && key.endsWith(":id")) return node.attrs[key];
  return undefined;
}

/** "ppt/slides" + "../media/a.png" → "ppt/media/a.png". An absolute target ("/ppt/x.xml") is taken from the root. */
export function resolvePart(baseDir: string, target: string): string {
  const parts = target.startsWith("/") ? [] : baseDir.split("/").filter(Boolean);
  for (const seg of target.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

/** The relationships of a part: id → { target path, type }. */
async function relationships(text: (name: string) => Promise<string | null>, partPath: string): Promise<Map<string, { target: string; type: string }>> {
  const slash = partPath.lastIndexOf("/");
  const dir = slash < 0 ? "" : partPath.slice(0, slash);
  const xml = await text(`${dir}/_rels/${partPath.slice(slash + 1)}.rels`);
  const out = new Map<string, { target: string; type: string }>();
  if (!xml) return out;
  for (const rel of kids(parseXml(xml), "Relationship")) {
    // An external target is a link out of the file, never a part to read.
    if (rel.attrs.Id && rel.attrs.Target && rel.attrs.TargetMode !== "External") out.set(rel.attrs.Id, { target: resolvePart(dir, rel.attrs.Target), type: rel.attrs.Type ?? "" });
  }
  return out;
}

/* --------------------------------------------------------------------- Word */

export interface DocRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export type DocBlock =
  | { type: "paragraph"; heading: 0 | 1 | 2 | 3; list: boolean; align: "left" | "center" | "right"; runs: DocRun[] }
  | { type: "table"; rows: string[][] }
  | { type: "pageBreak" };

export interface DocxContent {
  blocks: DocBlock[];
  /** True when the document is longer than what the preview shows. */
  truncated: boolean;
}

const MAX_BLOCKS = 1500;
const MAX_TABLE_ROWS = 300;
const MAX_TABLE_COLS = 30;

/** A Word on/off property: present means on, unless it says otherwise. */
function isOn(parent: XmlNode | undefined, name: string): boolean {
  const node = kid(parent, name);
  if (!node) return false;
  const value = attr(node, "val");
  return value === undefined || !["0", "false", "off", "none"].includes(value);
}

/** Paragraph style id → heading level, read from the document's own style sheet. */
function headingStyles(stylesXml: string | null): Map<string, 1 | 2 | 3> {
  const out = new Map<string, 1 | 2 | 3>();
  if (!stylesXml) return out;
  const basedOn = new Map<string, string>();
  const clamp = (n: number) => Math.max(1, Math.min(3, n)) as 1 | 2 | 3;
  for (const style of kids(parseXml(stylesXml), "style")) {
    const id = attr(style, "styleId");
    if (!id) continue;
    const name = (attr(kid(style, "name"), "val") ?? "").toLowerCase();
    const outline = attr(dig(style, "pPr", "outlineLvl"), "val");
    const numbered = /^heading (\d)$/.exec(name);
    if (numbered) out.set(id, clamp(Number(numbered[1])));
    else if (name === "title") out.set(id, 1);
    else if (name === "subtitle") out.set(id, 2);
    else if (outline !== undefined && /^\d$/.test(outline)) out.set(id, clamp(Number(outline) + 1));
    const parent = attr(kid(style, "basedOn"), "val");
    if (parent) basedOn.set(id, parent);
  }
  // A custom style built on a heading is a heading too.
  for (let pass = 0; pass < 4; pass++) {
    for (const [id, parent] of basedOn) {
      const level = out.get(parent);
      if (!out.has(id) && level) out.set(id, level);
    }
  }
  return out;
}

interface RunSink {
  runs: DocRun[];
  pageBreak: boolean;
}

function pushRun(run: XmlNode, sink: RunSink): void {
  const props = kid(run, "rPr");
  const underline = kid(props, "u");
  const style = { bold: isOn(props, "b"), italic: isOn(props, "i"), underline: underline !== undefined && attr(underline, "val") !== "none" };
  let text = "";
  for (const c of kids(run)) {
    if (c.name === "t") text += textOf(c);
    else if (c.name === "tab") text += "\t";
    else if (c.name === "cr") text += "\n";
    else if (c.name === "br") {
      if (attr(c, "type") === "page") sink.pageBreak = true;
      else text += "\n";
    } else if (c.name === "noBreakHyphen") text += "‑";
    // Drawings, pictures and embedded objects are not reproduced.
  }
  if (!text) return;
  const last = sink.runs[sink.runs.length - 1];
  if (last && Boolean(last.bold) === style.bold && Boolean(last.italic) === style.italic && Boolean(last.underline) === style.underline) last.text += text;
  else sink.runs.push({ text, ...(style.bold && { bold: true }), ...(style.italic && { italic: true }), ...(style.underline && { underline: true }) });
}

function collectRuns(node: XmlNode, sink: RunSink): void {
  for (const c of kids(node)) {
    if (c.name === "r") pushRun(c, sink);
    // Text that was deleted or moved away under "track changes" is no longer part of the document.
    else if (c.name === "del" || c.name === "moveFrom" || c.name === "pPr" || c.name === "rPr") continue;
    else if (c.name === "AlternateContent") {
      const pick = kid(c, "Fallback") ?? kid(c, "Choice");
      if (pick) collectRuns(pick, sink);
    } else collectRuns(c, sink); // hyperlinks, insertions, fields, content controls
  }
}

const plain = (p: XmlNode): string => {
  const sink: RunSink = { runs: [], pageBreak: false };
  collectRuns(p, sink);
  return sink.runs.map((r) => r.text).join("");
};

function readTable(tbl: XmlNode): DocBlock {
  const rows: string[][] = [];
  for (const tr of descendants(tbl, "tr").slice(0, MAX_TABLE_ROWS)) {
    rows.push(
      kids(tr, "tc")
        .slice(0, MAX_TABLE_COLS)
        .map((tc) =>
          descendants(tc, "p")
            .map(plain)
            .filter((t) => t.trim() !== "")
            .join("\n"),
        ),
    );
  }
  return { type: "table", rows };
}

export function readDocx(file: Blob, maxBlocks = MAX_BLOCKS): Promise<DocxContent> {
  return guarded(async () => {
    const zip = await open(file);
    const xml = await zip.text(MAIN_PART.docx);
    if (!xml) throw new OfficeError("unreadable");
    const headings = headingStyles(await zip.text("word/styles.xml").catch(() => null));
    const body = kid(parseXml(xml), "body");
    if (!body) throw new OfficeError("unreadable");

    const blocks: DocBlock[] = [];
    let truncated = false;
    const isEmpty = (b: DocBlock | undefined) => b?.type === "paragraph" && b.runs.length === 0;

    const read = (container: XmlNode) => {
      for (const c of kids(container)) {
        if (blocks.length >= maxBlocks) {
          truncated = true;
          return;
        }
        if (c.name === "p") {
          const props = kid(c, "pPr");
          const sink: RunSink = { runs: [], pageBreak: false };
          collectRuns(c, sink);
          const outline = attr(kid(props, "outlineLvl"), "val");
          const styled = headings.get(attr(kid(props, "pStyle"), "val") ?? "");
          const heading = styled ?? (outline !== undefined && /^[0-8]$/.test(outline) ? (Math.min(3, Number(outline) + 1) as 1 | 2 | 3) : 0);
          const jc = attr(kid(props, "jc"), "val");
          const block: DocBlock = { type: "paragraph", heading, list: kid(props, "numPr") !== undefined, align: jc === "center" ? "center" : jc === "right" || jc === "end" ? "right" : "left", runs: sink.runs };
          // Runs of empty paragraphs are how people add space in Word; one is enough here.
          if (!(isEmpty(block) && (blocks.length === 0 || isEmpty(blocks[blocks.length - 1])))) blocks.push(block);
          if (sink.pageBreak) blocks.push({ type: "pageBreak" });
        } else if (c.name === "tbl") blocks.push(readTable(c));
        else if (c.name === "sdt") {
          const content = kid(c, "sdtContent");
          if (content) read(content);
        } else if (c.name === "ins" || c.name === "customXml" || c.name === "smartTag") read(c);
      }
    };
    read(body);
    while (blocks.length && (isEmpty(blocks[blocks.length - 1]) || blocks[blocks.length - 1].type === "pageBreak")) blocks.pop();
    return { blocks, truncated };
  });
}

/* -------------------------------------------------------------------- Excel */

export interface SheetContent {
  name: string;
  /** Hidden in Excel. Shown here all the same: a hidden sheet is still in the file. */
  hidden: boolean;
  /** Rectangular: every row has the same number of cells. */
  rows: string[][];
  truncated: boolean;
}

export interface XlsxContent {
  sheets: SheetContent[];
  /** True when the workbook has more sheets than the preview shows. */
  truncated: boolean;
}

export const MAX_SHEETS = 20;
export const MAX_SHEET_ROWS = 300;
export const MAX_SHEET_COLS = 40;
const MAX_SHARED_STRINGS = 200_000;

type CellFormat = "date" | "time" | "datetime" | "percent" | null;

const BUILTIN_FORMAT: Record<number, CellFormat> = { 9: "percent", 10: "percent", 14: "date", 15: "date", 16: "date", 17: "date", 18: "time", 19: "time", 20: "time", 21: "time", 22: "datetime", 45: "time", 46: "time", 47: "time" };

/** What a custom number format displays: a date, a time, a percentage, or just a number. */
export function classifyFormat(code: string): CellFormat {
  // Literal text, colors and conditions are not part of the pattern itself. Real formats are a few dozen characters.
  const pattern = code.slice(0, 256).replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "").toLowerCase();
  if (pattern.includes("%")) return "percent";
  const date = /[dy]/.test(pattern);
  const time = /[hs]/.test(pattern) || /am\/pm/.test(pattern);
  if (date && time) return "datetime";
  if (date) return "date";
  if (time) return "time";
  return /m/.test(pattern) && !/[0#?]/.test(pattern) ? "date" : null;
}

function cellFormats(stylesXml: string | null): CellFormat[] {
  if (!stylesXml) return [];
  const root = parseXml(stylesXml);
  const custom = new Map<number, CellFormat>();
  for (const f of kids(kid(root, "numFmts"), "numFmt")) custom.set(Number(f.attrs.numFmtId), classifyFormat(f.attrs.formatCode ?? ""));
  return kids(kid(root, "cellXfs"), "xf").map((xf) => {
    const id = Number(xf.attrs.numFmtId ?? 0);
    return custom.get(id) ?? BUILTIN_FORMAT[id] ?? null;
  });
}

const two = (n: number) => String(n).padStart(2, "0");

/** A number as a person would write it in French, without the noise of binary floating point. */
export function showNumber(n: number): string {
  return String(parseFloat(n.toPrecision(15))).replace(".", ",");
}

/** An Excel date serial (days since the end of 1899, or since 1904 on old Mac workbooks) as text. */
export function serialToText(serial: number, format: Exclude<CellFormat, "percent" | null>, date1904 = false): string {
  const ms = Math.round((serial + (date1904 ? 1462 : 0) - 25569) * 86_400_000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return showNumber(serial);
  const date = `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
  const time = `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}${d.getUTCSeconds() ? `:${two(d.getUTCSeconds())}` : ""}`;
  return format === "date" ? date : format === "time" ? time : `${date} ${time}`;
}

/** "C7" → 2, "AA1" → 26. Returns -1 when there is no column. */
export function columnIndex(ref: string): number {
  let n = 0;
  let i = 0;
  for (; i < ref.length; i++) {
    const c = ref.charCodeAt(i) & ~32; // upper case
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return i === 0 ? -1 : n - 1;
}

/** 0 → "A", 26 → "AA". */
export function columnName(index: number): string {
  let out = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
  return out;
}

function sharedStrings(xml: string | null): string[] {
  const out: string[] = [];
  if (!xml) return out;
  let current: string | null = null;
  let inText = false;
  let phonetic = 0;
  for (const t of xmlTokens(xml)) {
    if (t.type === "open") {
      if (t.name === "si") current = t.selfClosing ? null : "";
      else if (t.name === "rPh") phonetic += t.selfClosing ? 0 : 1; // pronunciation hints for East Asian text
      else if (t.name === "t" && !t.selfClosing) inText = true;
      if (t.name === "si" && t.selfClosing) out.push("");
    } else if (t.type === "close") {
      if (t.name === "t") inText = false;
      else if (t.name === "rPh") phonetic = Math.max(0, phonetic - 1);
      else if (t.name === "si" && current !== null) {
        out.push(current);
        current = null;
        if (out.length >= MAX_SHARED_STRINGS) break;
      }
    } else if (inText && current !== null && phonetic === 0) current += t.text;
  }
  return out;
}

function readSheet(xml: string, strings: string[], formats: CellFormat[], date1904: boolean, maxRows: number, maxCols: number): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = [];
  let truncated = false;
  let row: string[] | null = null;
  let cell: { col: number; type: string; style: number; value: string; inline: string } | null = null;
  let reading: "v" | "inline" | null = null;
  let nextCol = 0;

  const display = (c: NonNullable<typeof cell>): string => {
    if (c.type === "inlineStr") return c.inline;
    const v = c.value;
    if (v === "") return "";
    if (c.type === "s") return strings[Number(v)] ?? "";
    if (c.type === "b") return v === "1" ? "VRAI" : "FAUX";
    if (c.type === "str" || c.type === "e" || c.type === "d") return v;
    const n = Number(v);
    if (!Number.isFinite(n)) return v;
    const format = formats[c.style] ?? null;
    if (format === "percent") return `${showNumber(n * 100)} %`;
    return format ? serialToText(n, format, date1904) : showNumber(n);
  };

  for (const t of xmlTokens(xml)) {
    if (t.type === "open") {
      if (t.name === "row") {
        // Rows that are entirely empty are simply absent from the file: keep the gap so the layout holds.
        const number = Number(t.attrs.r);
        if (Number.isInteger(number) && number > rows.length + 1) {
          const gap = Math.min(number - 1, maxRows) - rows.length;
          for (let i = 0; i < gap; i++) rows.push([]);
        }
        if (rows.length >= maxRows) {
          truncated = true;
          break;
        }
        row = [];
        nextCol = 0;
        if (t.selfClosing) {
          rows.push(row);
          row = null;
        }
      } else if (t.name === "c" && row) {
        const fromRef = t.attrs.r ? columnIndex(t.attrs.r) : -1;
        cell = { col: fromRef >= 0 ? fromRef : nextCol, type: t.attrs.t ?? "n", style: Number(t.attrs.s ?? 0), value: "", inline: "" };
        nextCol = cell.col + 1;
        if (t.selfClosing) cell = null;
      } else if (cell && !t.selfClosing) {
        if (t.name === "v") reading = "v";
        else if (t.name === "t") reading = "inline";
      }
    } else if (t.type === "close") {
      if (t.name === "v" || t.name === "t") reading = null;
      else if (t.name === "c" && cell && row) {
        if (cell.col < maxCols) {
          const text = display(cell);
          if (text !== "") {
            while (row.length < cell.col) row.push("");
            row[cell.col] = text;
          }
        } else truncated = true;
        cell = null;
      } else if (t.name === "row" && row) {
        rows.push(row);
        row = null;
      } else if (t.name === "sheetData") break;
    } else if (cell && reading === "v") cell.value += t.text;
    else if (cell && reading === "inline") cell.inline += t.text;
  }

  while (rows.length && rows[rows.length - 1].every((c) => c === "")) rows.pop();
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  for (const r of rows) while (r.length < width) r.push("");
  return { rows, truncated };
}

/** `limits` caps what is read from each sheet: the preview shows a first screenful, the search index reads further. */
export function readXlsx(file: Blob, limits: { rows: number; cols: number } = { rows: MAX_SHEET_ROWS, cols: MAX_SHEET_COLS }): Promise<XlsxContent> {
  return guarded(async () => {
    const zip = await open(file);
    const xml = await zip.text(MAIN_PART.xlsx);
    if (!xml) throw new OfficeError("unreadable");
    const workbook = parseXml(xml);
    const rels = await relationships(zip.text, MAIN_PART.xlsx);
    const date1904 = ["1", "true"].includes(attr(kid(workbook, "workbookPr"), "date1904") ?? "");
    const listed = kids(kid(workbook, "sheets"), "sheet");
    // Styles and shared strings are optional parts; a workbook without them still has its cells.
    const formats = cellFormats(await zip.text("xl/styles.xml"));
    const strings = sharedStrings(await zip.text("xl/sharedStrings.xml"));

    const sheets: SheetContent[] = [];
    for (const [i, sheet] of listed.slice(0, MAX_SHEETS).entries()) {
      const id = relId(sheet);
      const path = (id && rels.get(id)?.target) || `xl/worksheets/sheet${i + 1}.xml`;
      const name = sheet.attrs.name || `Feuille ${i + 1}`;
      const hidden = sheet.attrs.state === "hidden" || sheet.attrs.state === "veryHidden";
      const sheetXml = await zip.text(path);
      // A chart sheet or a missing part has no cells to show.
      sheets.push({ name, hidden, ...(sheetXml ? readSheet(sheetXml, strings, formats, date1904, limits.rows, limits.cols) : { rows: [], truncated: false }) });
    }
    return { sheets, truncated: listed.length > MAX_SHEETS };
  });
}

/* --------------------------------------------------------------- PowerPoint */

export interface SlideLine {
  text: string;
  /** Indentation level of the bullet, 0 to 8. */
  level: number;
}

export interface SlideContent {
  title: string | null;
  lines: SlideLine[];
  /** Speaker notes: not shown to the audience, but in the file all the same. */
  notes: string;
  /** Hidden from the slide show. */
  hidden: boolean;
}

export interface PptxContent {
  slides: SlideContent[];
  truncated: boolean;
}

export const MAX_SLIDES = 200;

function paragraphText(p: XmlNode): string {
  let out = "";
  for (const c of kids(p)) {
    if (c.name === "r" || c.name === "fld") out += textOf(kid(c, "t"));
    else if (c.name === "br") out += " ";
  }
  return out.replace(/\s+/g, " ").trim();
}

const placeholder = (shape: XmlNode) => attr(dig(shape, "nvSpPr", "nvPr", "ph"), "type");

function readSlide(xml: string): Omit<SlideContent, "notes"> {
  const root = parseXml(xml);
  let title: string | null = null;
  const lines: SlideLine[] = [];
  const walk = (tree: XmlNode | undefined) => {
    for (const c of kids(tree)) {
      if (c.name === "sp") {
        const kind = placeholder(c);
        const paragraphs = kids(kid(c, "txBody"), "p");
        if ((kind === "title" || kind === "ctrTitle") && title === null) {
          title = paragraphs.map(paragraphText).filter(Boolean).join(" ") || null;
        } else if (kind !== "sldNum" && kind !== "dt" && kind !== "ftr") {
          for (const p of paragraphs) {
            const text = paragraphText(p);
            if (text) lines.push({ text, level: Math.max(0, Math.min(8, Number(attr(kid(p, "pPr"), "lvl") ?? 0) || 0)) });
          }
        }
      } else if (c.name === "grpSp") walk(c);
      else if (c.name === "graphicFrame") {
        for (const tr of descendants(c, "tr")) {
          const cells = kids(tr, "tc").map((tc) => descendants(tc, "p").map(paragraphText).filter(Boolean).join(" "));
          if (cells.some(Boolean)) lines.push({ text: cells.join(" · "), level: 0 });
        }
      } else if (c.name === "AlternateContent") walk(kid(c, "Fallback") ?? kid(c, "Choice"));
    }
  };
  walk(dig(root, "cSld", "spTree"));
  return { title, lines, hidden: root.attrs.show === "0" };
}

function readNotes(xml: string): string {
  const out: string[] = [];
  for (const shape of descendants(dig(parseXml(xml), "cSld", "spTree"), "sp")) {
    if (placeholder(shape) !== "body") continue;
    for (const p of kids(kid(shape, "txBody"), "p")) {
      const text = paragraphText(p);
      if (text) out.push(text);
    }
  }
  return out.join("\n");
}

export function readPptx(file: Blob): Promise<PptxContent> {
  return guarded(async () => {
    const zip = await open(file);
    const xml = await zip.text(MAIN_PART.pptx);
    if (!xml) throw new OfficeError("unreadable");
    const rels = await relationships(zip.text, MAIN_PART.pptx);
    // The presentation lists its slides in show order; file names alone do not say it.
    let paths = kids(kid(parseXml(xml), "sldIdLst"), "sldId")
      .map((s) => rels.get(relId(s) ?? "")?.target)
      .filter((p): p is string => Boolean(p));
    if (paths.length === 0) {
      const number = (name: string) => Number(/slide(\d+)\.xml$/i.exec(name)?.[1] ?? 0);
      paths = zip.items
        .map((i) => i.name)
        .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
        .sort((a, b) => number(a) - number(b));
    }
    const slides: SlideContent[] = [];
    for (const path of paths.slice(0, MAX_SLIDES)) {
      const slideXml = await zip.text(path);
      if (!slideXml) continue;
      let notes = "";
      for (const rel of (await relationships(zip.text, path)).values()) {
        if (!rel.type.endsWith("/notesSlide")) continue;
        const notesXml = await zip.text(rel.target);
        if (notesXml) notes = readNotes(notesXml);
      }
      slides.push({ ...readSlide(slideXml), notes });
    }
    return { slides, truncated: paths.length > MAX_SLIDES };
  });
}
