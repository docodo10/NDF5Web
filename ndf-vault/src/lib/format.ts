import type { FileKind, FileStatus, Folder, VaultFile } from "./types";

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juill.", "août", "sept.", "oct.", "nov.", "déc."];

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d === 1 ? "1er" : d} ${MONTHS[m - 1]} ${y}`;
}

export function formatTime(iso: string): string {
  const [h, min] = iso.slice(11, 16).split(":").map(Number);
  return `${h} h ${String(min).padStart(2, "0")}`;
}

const decimal = (n: number) => n.toFixed(1).replace(".", ",");

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} Ko`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? decimal(mb) : Math.round(mb)} Mo`;
  return `${decimal(mb / 1024)} Go`;
}

export const KIND_LABEL: Record<FileKind, string> = {
  pdf: "PDF",
  docx: "Document",
  xlsx: "Tableur",
  pptx: "Présentation",
  txt: "Texte",
  csv: "CSV",
  image: "Image",
};

/** Statuses keep their internal English ids; this is what the interface shows. */
export const STATUS_LABEL: Record<FileStatus, string> = {
  Draft: "Brouillon",
  "In Review": "En révision",
  Approved: "Approuvé",
  Final: "Final",
  Archived: "Archivé",
};

/** "1 fichier", "3 fichiers". */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n > 1 ? plural : singular}`;
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
