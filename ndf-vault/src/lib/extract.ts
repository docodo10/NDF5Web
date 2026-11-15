import { readDocx, readPptx, readXlsx } from "./office";
import { openPdf } from "./pdf";
import { MAX_TEXT_CHARS, type DocText } from "./search";
import type { FileKind } from "./types";

/**
 * The text of a stored original, for the search index. Images have none, and
 * a scanned PDF (pictures of pages) comes back empty: there is no character
 * recognition here.
 */

const MAX_PDF_PAGES = 500;

async function pdfText(blob: Blob): Promise<DocText> {
  const pdf = await openPdf(blob);
  try {
    const pages: string[] = [];
    let room = MAX_TEXT_CHARS;
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_PDF_PAGES) && room > 0; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str + (item.hasEOL ? "\n" : " ");
      }
      pages.push(text);
      room -= text.length;
    }
    return { pages };
  } finally {
    void pdf.loadingTask.destroy();
  }
}

/** Returns null for a kind that has no text to index. Throws when the file cannot be read. */
export async function extractText(kind: FileKind, blob: Blob): Promise<DocText | null> {
  if (kind === "pdf") return pdfText(blob);
  if (kind === "txt" || kind === "csv") return { pages: [await blob.slice(0, MAX_TEXT_CHARS * 2).text()] };
  if (kind === "docx") {
    const { blocks } = await readDocx(blob, 20_000);
    const lines = blocks.map((b) => (b.type === "paragraph" ? b.runs.map((r) => r.text).join("") : b.type === "table" ? b.rows.map((r) => r.join(" | ")).join("\n") : ""));
    return { pages: [lines.join("\n")] };
  }
  if (kind === "xlsx") {
    const { sheets } = await readXlsx(blob, { rows: 5000, cols: 100 });
    return { pages: sheets.map((s) => `${s.name}\n${s.rows.map((r) => r.filter(Boolean).join(" ")).join("\n")}`) };
  }
  if (kind === "pptx") {
    const { slides } = await readPptx(blob);
    return { pages: slides.map((s) => [s.title ?? "", ...s.lines.map((l) => l.text), s.notes].filter(Boolean).join("\n")) };
  }
  return null;
}

/** What a page of the document is called, for a search result: "Page 3", "Diapositive 2", "Feuille 1". */
export function pageLabel(kind: FileKind, page: number, pages: number): string {
  if (kind === "pdf") return `Page ${page + 1}`;
  if (kind === "pptx") return `Diapositive ${page + 1}`;
  if (kind === "xlsx") return pages > 1 ? `Feuille ${page + 1}` : "";
  return "";
}
