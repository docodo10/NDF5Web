import { sha256Hex } from "./crypto";
import { sanitizeName } from "./format";
import { inspectOffice, OFFICE_LABEL, type OfficeFormat } from "./office";
import { EXT_KIND } from "./sample-data";
import type { FileKind } from "./types";

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export const ACCEPTED_EXTENSIONS = Object.keys(EXT_KIND);

/** Value for <input type="file" accept>. */
export const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(",");

export interface UploadCheck {
  file: File;
  name: string;
  ext: string;
  kind: FileKind | null;
  /** Why the file is refused, in French; null when it can be uploaded. */
  error: string | null;
  /** Fingerprint of the content, once it has been read. */
  sha256?: string;
  /** Name of a file already in the vault with exactly the same content. */
  duplicateOf?: string;
  /** For a file that came inside a folder: the folders above it, outermost first. They are created on upload. */
  path?: string[];
}

/** A file chosen for upload, with the folders it sat in when a whole folder was chosen or dropped. */
export interface Picked {
  file: File;
  path: string[];
}

/** The most files taken from one dropped or chosen folder. */
export const MAX_FOLDER_FILES = 1000;
const MAX_FOLDER_DEPTH = 12;

/** Files a system leaves in folders for its own use: never what someone meant to upload. */
const isClutter = (name: string) => name.startsWith(".") || name.startsWith("~$") || /^(thumbs\.db|desktop\.ini)$/i.test(name);

/** "Contrats/2026/Entente.pdf" → ["Contrats", "2026"]: clean folder names, nothing that climbs or hides. */
export function folderSegments(relativePath: string): string[] {
  return relativePath
    .split(/[\\/]/)
    .slice(0, -1)
    .map((s) => sanitizeName(s))
    .filter((s) => s && s !== "." && s !== "..")
    .slice(0, MAX_FOLDER_DEPTH);
}

/** Files from a file input. One opened on a folder gives each file its path inside that folder. */
export function pickedFromInput(list: FileList | File[] | null): Picked[] {
  return Array.from(list ?? [])
    .filter((f) => !isClutter(f.name))
    .slice(0, MAX_FOLDER_FILES)
    .map((file) => ({ file, path: folderSegments(file.webkitRelativePath ?? "") }));
}

type Entry = { isFile: boolean; isDirectory: boolean; name: string; file?: (ok: (f: File) => void, no: () => void) => void; createReader?: () => { readEntries: (ok: (e: Entry[]) => void, no: () => void) => void } };

/**
 * What was dropped: plain files, or whole folders walked through to their
 * files. The entries must be taken from the event at once, before anything is
 * awaited: the browser empties the drop as soon as its handler returns.
 */
export function pickedFromDrop(data: DataTransfer | null): Promise<Picked[]> {
  if (!data) return Promise.resolve([]);
  const entries = Array.from(data.items ?? [])
    .map((item) => (item.kind === "file" ? ((item as unknown as { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry?.() ?? null) : null))
    .filter((e): e is Entry => e !== null);
  // A browser without folder entries still gives the files themselves.
  if (entries.length === 0) return Promise.resolve(pickedFromInput(data.files));

  const out: Picked[] = [];
  const walk = async (entry: Entry, path: string[]): Promise<void> => {
    if (out.length >= MAX_FOLDER_FILES || isClutter(entry.name)) return;
    if (entry.isFile && entry.file) {
      const file = await new Promise<File | null>((resolve) => entry.file!(resolve, () => resolve(null)));
      if (file) out.push({ file, path });
    } else if (entry.isDirectory && entry.createReader && path.length < MAX_FOLDER_DEPTH) {
      const name = sanitizeName(entry.name);
      const reader = entry.createReader();
      // A folder is read in batches: keep asking until a batch comes back empty.
      for (;;) {
        const batch = await new Promise<Entry[]>((resolve) => reader.readEntries(resolve, () => resolve([])));
        if (batch.length === 0) break;
        for (const child of batch) await walk(child, name ? [...path, name] : path);
      }
    }
  };
  return (async () => {
    for (const entry of entries) await walk(entry, []);
    return out;
  })();
}

/** The cheap checks: extension, size. */
export function checkUpload(file: File): UploadCheck {
  const dot = file.name.lastIndexOf(".");
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "";
  const name = sanitizeName(dot > 0 ? file.name.slice(0, dot) : file.name) || "Sans titre";
  const kind = EXT_KIND[ext] ?? null;
  let error: string | null = null;
  if (!kind) error = ext ? `Le format .${ext} n’est pas accepté.` : "Ce fichier n’a pas d’extension.";
  else if (file.size === 0) error = "Ce fichier est vide.";
  else if (file.size > MAX_UPLOAD_BYTES) error = "Ce fichier dépasse la limite de 100 Mo.";
  return { file, name, ext, kind, error };
}

/* --------------------------------------------------------- Content sniffing */

export type Detected = "pdf" | "png" | "jpg" | "gif" | "webp" | "zip" | "executable" | "binary" | "text";

const starts = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

/** What the first bytes of a file actually are, whatever its name says. */
export function detectContent(head: Uint8Array): Detected {
  if (starts(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (starts(head, [0xff, 0xd8, 0xff])) return "jpg";
  if (starts(head, ascii("GIF87a")) || starts(head, ascii("GIF89a"))) return "gif";
  if (starts(head, ascii("RIFF")) && starts(head, ascii("WEBP"), 8)) return "webp";
  if (starts(head, [0x50, 0x4b, 0x03, 0x04]) || starts(head, [0x50, 0x4b, 0x05, 0x06])) return "zip";
  if (starts(head, ascii("MZ")) || starts(head, [0x7f, 0x45, 0x4c, 0x46]) || starts(head, [0xcf, 0xfa, 0xed, 0xfe]) || starts(head, [0xca, 0xfe, 0xba, 0xbe])) return "executable";
  // A PDF's header may sit after a little leading junk, within the first kilobyte.
  const limit = Math.min(head.length, 1024) - 4;
  for (let i = 0; i < limit; i++) if (starts(head, [0x25, 0x50, 0x44, 0x46, 0x2d], i)) return "pdf";
  // UTF-16 text carries a byte-order mark and legitimately contains zero bytes.
  if (starts(head, [0xff, 0xfe]) || starts(head, [0xfe, 0xff])) return "text";
  for (let i = 0; i < head.length; i++) if (head[i] === 0) return "binary";
  return "text";
}

const EXPECTED: Record<string, Detected> = {
  pdf: "pdf",
  png: "png",
  jpg: "jpg",
  jpeg: "jpg",
  gif: "gif",
  webp: "webp",
  docx: "zip",
  xlsx: "zip",
  pptx: "zip",
  txt: "text",
  csv: "text",
};

/** True when a file's first bytes are what its extension claims. */
export function contentMatches(ext: string, head: Uint8Array): boolean {
  return EXPECTED[ext] !== undefined && detectContent(head) === EXPECTED[ext];
}

const SNIFF_BYTES = 64 * 1024;

/**
 * The full check before a file is accepted: extension and size, then the
 * content itself (a renamed executable is refused), then its fingerprint,
 * which also reveals a file the vault already holds.
 */
export async function inspectUpload(file: File, existing: { sha256?: string; label: string }[] = []): Promise<UploadCheck> {
  const check = checkUpload(file);
  if (check.error) return check;
  try {
    const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
    if (!contentMatches(check.ext, head)) return { ...check, error: `Le contenu ne correspond pas à l’extension .${check.ext}.` };
    // An Office file is a ZIP, and so is much else: look inside before trusting the name.
    if (check.ext === "docx" || check.ext === "xlsx" || check.ext === "pptx") {
      const verdict = await inspectOffice(file, check.ext as OfficeFormat);
      if (verdict === "active-content") return { ...check, error: "Ce fichier contient des macros ou des contrôles actifs : il est refusé." };
      if (verdict !== "ok") return { ...check, error: `Ce fichier n’est pas ${OFFICE_LABEL[check.ext as OfficeFormat]} valide.` };
    }
    const sha256 = await sha256Hex(file);
    const twin = existing.find((e) => e.sha256 === sha256);
    return { ...check, sha256, duplicateOf: twin?.label };
  } catch {
    return { ...check, error: "Ce fichier est illisible." };
  }
}

/**
 * Hand a file to the viewer. A hosted page cannot start a download by itself,
 * so the host's own save prompt is used when there is one; otherwise a normal
 * browser download.
 */
export async function saveToDisk(filename: string, blob: Blob): Promise<"saved" | "declined" | "failed"> {
  type Downloads = { save: (r: { filename: string; data: Blob }) => Promise<unknown> };
  const host = (window as unknown as { claude?: { use: (name: string) => Promise<Downloads | null> } }).claude;
  if (host?.use) {
    try {
      const downloads = await host.use("downloads");
      if (downloads) {
        await downloads.save({ filename, data: blob });
        return "saved";
      }
    } catch (e) {
      return (e as { code?: string })?.code === "declined" ? "declined" : "failed";
    }
    return "failed";
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return "saved";
  } catch {
    return "failed";
  }
}
