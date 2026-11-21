import { getLang, localized } from "./i18n";
import type { FileKind, FileStatus, Folder, VaultFile } from "./types";

// i18n-ok: paired with MONTHS_EN.
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juill.", "août", "sept.", "oct.", "nov.", "déc."];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "14 nov. 2026" in French, "Nov 14, 2026" in English. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (getLang() === "en") return `${MONTHS_EN[m - 1]} ${d}, ${y}`;
  return `${d === 1 ? "1er" : d} ${MONTHS[m - 1]} ${y}`;
}

/** "15 h 04" in French, "3:04 PM" in English. */
export function formatTime(iso: string): string {
  const [h, min] = iso.slice(11, 16).split(":").map(Number);
  if (getLang() === "en") return `${h % 12 === 0 ? 12 : h % 12}:${String(min).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  return `${h} h ${String(min).padStart(2, "0")}`;
}

/** A moment in this device's time zone: "14 nov. 2026, 15 h 04". */
export function formatMoment(when: Date | string): string {
  const d = typeof when === "string" ? new Date(when) : when;
  if (Number.isNaN(d.getTime())) return "";
  const two = (n: number) => String(n).padStart(2, "0");
  const local = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;
  return `${formatDate(local)}, ${formatTime(local)}`;
}

/** "2,4 Mo" in French, "2.4 MB" in English. */
export function formatSize(bytes: number): string {
  const en = getLang() === "en";
  const decimal = (n: number) => (en ? n.toFixed(1) : n.toFixed(1).replace(".", ","));
  const [b, k, m, g] = en ? ["B", "KB", "MB", "GB"] : ["o", "Ko", "Mo", "Go"];
  if (bytes < 1024) return `${bytes} ${b}`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} ${k}`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? decimal(mb) : Math.round(mb)} ${m}`;
  return `${decimal(mb / 1024)} ${g}`;
}

export const KIND_LABEL: Record<FileKind, string> = localized({
  pdf: ["PDF", "PDF"],
  docx: ["Document", "Document"],
  xlsx: ["Tableur", "Spreadsheet"],
  pptx: ["Présentation", "Presentation"],
  txt: ["Texte", "Text"],
  csv: ["CSV", "CSV"],
  image: ["Image", "Image"],
});

/** Statuses keep their internal English ids; this is what the interface shows. */
export const STATUS_LABEL: Record<FileStatus, string> = localized({
  Draft: ["Brouillon", "Draft"],
  "In Review": ["En révision", "In review"],
  Approved: ["Approuvé", "Approved"],
  Final: ["Final", "Final"],
  Archived: ["Archivé", "Archived"],
});

/** "1 fichier", "3 fichiers"; "1 file", "3 files". The caller gives the noun in the current language. */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  // French keeps the singular for zero ("0 fichier"); English does not ("0 files").
  const many = getLang() === "en" ? n !== 1 : n > 1;
  return `${n} ${many ? plural : singular}`;
}

export function fullName(f: Pick<VaultFile, "name" | "ext">): string {
  return `${f.name}.${f.ext}`;
}

export function folderPath(folders: Folder[], id: string): Folder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out: Folder[] = [];
  let cur = byId.get(id);
  while (cur) {
    out.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}

export function descendantIds(folders: Folder[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id);
        grew = true;
      }
    }
  }
  return out;
}

export function folderLabel(f: Folder): string {
  if (f.index) return `${f.index} ${f.name}`;
  return f.code ? `${f.name} (${f.code})` : f.name;
}

export const MAX_NAME_LEN = 120;

/**
 * Clean a name typed by the user or taken from an uploaded file, before it is
 * stored. Control characters and bidirectional overrides are removed (the
 * latter can make "exe.pdf" display as "fdp.exe"), path separators become
 * dashes, runs of whitespace collapse, leading dots go (no hidden or "../"
 * names) and the length is capped. Display is safe either way, since React
 * escapes text; this keeps names safe as storage keys, ZIP paths and download
 * filenames too.
 */
export function sanitizeName(raw: string): string {
  return (
    raw
      .normalize("NFC")
      .replace(/\s+/g, " ")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
      .replace(/[\\/:]/g, "-")
      .replace(/[<>"|?*]/g, "")
      .replace(/ {2,}/g, " ")
      .replace(/^[.\s]+/, "")
      .trim()
      .slice(0, MAX_NAME_LEN)
      .trim()
  );
}
