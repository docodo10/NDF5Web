/**
 * Search inside documents.
 *
 * A document's text is kept page by page. Next to it sits a "folded" copy
 * (lower case, accents removed) that has exactly the same length, character
 * for character, so a match found in the folded text can be cut out of the
 * original with the same positions.
 */

/** The text of a document: one entry per page, slide or sheet; a single entry for anything else. */
export interface DocText {
  pages: string[];
}

export interface IndexedText {
  pages: string[];
  folded: string[];
}

export interface Hit {
  /** Index of the page the excerpt comes from. */
  page: number;
  /** The excerpt, cut from the original text around the first match. */
  before: string;
  match: string;
  after: string;
  /** How many times the terms occur in the whole document. */
  count: number;
  /** True when the words were found together, in order. */
  phrase: boolean;
}

/** The most text kept per document. A long contract is about 300,000 characters. */
export const MAX_TEXT_CHARS = 2_000_000;
/** Shorter queries match nearly everything and are not searched in content. */
export const MIN_QUERY_LENGTH = 3;

const COMBINING = /[̀-ͯ]/;

/** One character in, one character out: "É" → "e", "ç" → "c", "A" → "a". */
function foldChar(c: string): string {
  const code = c.charCodeAt(0);
  if (code < 128) return code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : c;
  // Half of a pair (emoji, rare scripts): leave it alone.
  if (code >= 0xd800 && code <= 0xdfff) return c;
  const base = c.normalize("NFD");
  const first = base.length > 1 && COMBINING.test(base[1]) ? base[0] : c;
  const lower = first.toLowerCase();
  return lower.length === 1 ? lower : first;
}

/** Lower case, without accents, same length as the input. */
export function fold(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) out += foldChar(text[i]);
  return out;
}

/** Tidy extracted text: composed characters, no control characters, single spaces, at most one blank line. */
export function cleanText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, "")
    .replace(/[ \t  ]+/g, " ")
    .replace(/ ?\r?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Prepare a document for searching. Text beyond the size limit is left out. */
export function indexText(doc: DocText): IndexedText {
  const pages: string[] = [];
  let room = MAX_TEXT_CHARS;
  for (const raw of doc.pages) {
    const page = cleanText(raw).slice(0, Math.max(0, room));
    room -= page.length;
    pages.push(page);
  }
  return { pages, folded: pages.map(fold) };
}

/** The words of a query, folded. */
export function queryTerms(query: string): string[] {
  return fold(query.normalize("NFC")).split(/\s+/).filter(Boolean);
}

function occurrences(hay: string, needle: string, limit = 999): number {
  let n = 0;
  for (let at = hay.indexOf(needle); at >= 0 && n < limit; at = hay.indexOf(needle, at + needle.length)) n++;
  return n;
}

const CONTEXT = 60;

/**
 * Find a query in a document. Every word must occur somewhere in it; the
 * excerpt shows the whole phrase when the words appear together, and the
 * first word otherwise. Returns null when the document does not match.
 */
export function searchText(doc: IndexedText, query: string): Hit | null {
  const terms = queryTerms(query);
  const phrase = terms.join(" ");
  if (phrase.length < MIN_QUERY_LENGTH) return null;

  let phraseAt: { page: number; at: number } | null = null;
  const firstAt: ({ page: number; at: number } | null)[] = terms.map(() => null);
  let count = 0;
  for (let p = 0; p < doc.folded.length; p++) {
    const text = doc.folded[p];
    if (!phraseAt && terms.length > 1) {
      const at = text.indexOf(phrase);
      if (at >= 0) phraseAt = { page: p, at };
    }
    for (let t = 0; t < terms.length; t++) {
      const at = text.indexOf(terms[t]);
      if (at < 0) continue;
      firstAt[t] ??= { page: p, at };
      count += occurrences(text, terms[t]);
    }
  }
  if (firstAt.some((f) => f === null)) return null;

  const where = phraseAt ?? firstAt[0]!;
  const length = phraseAt ? phrase.length : terms[0].length;
  const source = doc.pages[where.page];
  const from = Math.max(0, where.at - CONTEXT);
  const to = Math.min(source.length, where.at + length + CONTEXT);
  const oneLine = (s: string) => s.replace(/\s+/g, " ");
  return {
    page: where.page,
    before: (from > 0 ? "…" : "") + oneLine(source.slice(from, where.at)).trimStart(),
    match: oneLine(source.slice(where.at, where.at + length)),
    after: oneLine(source.slice(where.at + length, to)).trimEnd() + (to < source.length ? "…" : ""),
    count,
    phrase: phraseAt !== null || terms.length === 1,
  };
}
