import { createEnvelope, decryptBytes, decryptJson, encryptBytes, encryptJson, openEnvelope, WrongPassphraseError, type KeyEnvelope } from "./crypto";
import { DEFAULT_PROFILE, SCHEMA, migrate, type Persisted } from "./db";
import { sanitizeName } from "./format";
import type { ActivityItem, FileKind, FileStatus, FileVersion, Folder, Project, VaultFile } from "./types";
import { STATUSES } from "./types";

/**
 * An encrypted backup of the whole vault in one file: the state and every
 * stored original, sealed under a passphrase chosen for the backup.
 *
 *   magic | header length | header (clear: how to derive the key)
 *         | manifest length | manifest (encrypted: the state, and the list of originals)
 *         | each original, encrypted, in the manifest's order
 *
 * Nothing about the documents is readable without the passphrase: names,
 * sizes and order are all inside the encrypted manifest. Each record is bound
 * to its place, so records cannot be swapped or dropped unnoticed.
 */

export const BACKUP_EXTENSION = "ndfvault";
const MAGIC = new TextEncoder().encode("NDFVAULT-BACKUP\n");
/** What AES-GCM adds to a record: the nonce in front, the tag behind. */
const OVERHEAD = 12 + 16;
const MAX_HEADER_BYTES = 4096;
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;
/** A header may not ask for more key-stretching than this: it would freeze the page. */
const MAX_ITERATIONS = 5_000_000;

export type BackupProblem = "not-a-backup" | "unsupported" | "wrong-passphrase" | "damaged";

export class BackupError extends Error {
  constructor(public readonly problem: BackupProblem) {
    super(problem);
    this.name = "BackupError";
  }
}

export interface BackupBlob {
  id: string;
  data: Blob;
}

interface Header {
  v: 1;
  createdAt: string;
  kdf: KeyEnvelope;
}

interface Manifest {
  createdAt: string;
  state: Persisted;
  blobs: { id: string; type: string; size: number }[];
}

const u32 = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
};

export async function createBackup(passphrase: string, state: Persisted, blobs: BackupBlob[], options: { iterations?: number; now?: Date } = {}): Promise<Blob> {
  const createdAt = (options.now ?? new Date()).toISOString();
  const { envelope, key } = await createEnvelope(passphrase, options.iterations);
  const header = new TextEncoder().encode(JSON.stringify({ v: 1, createdAt, kdf: envelope } satisfies Header));
  const manifest: Manifest = { createdAt, state, blobs: blobs.map((b) => ({ id: b.id, type: b.data.type, size: b.data.size })) };
  const sealedManifest = await encryptJson(key, manifest, "backup:manifest");
  const parts: BlobPart[] = [MAGIC, u32(header.length), header, u32(sealedManifest.byteLength), sealedManifest];
  for (const [i, b] of blobs.entries()) parts.push(await encryptBytes(key, await b.data.arrayBuffer(), `backup:blob:${i}:${b.id}`));
  return new Blob(parts, { type: "application/octet-stream" });
}

async function readHeader(file: Blob): Promise<{ header: Header; end: number }> {
  const start = new Uint8Array(await file.slice(0, MAGIC.length + 4).arrayBuffer());
  if (start.length < MAGIC.length + 4 || MAGIC.some((v, i) => start[i] !== v)) throw new BackupError("not-a-backup");
  const length = new DataView(start.buffer).getUint32(MAGIC.length, true);
  const end = MAGIC.length + 4 + length;
  if (length === 0 || length > MAX_HEADER_BYTES || end > file.size) throw new BackupError("damaged");
  let header: Header;
  try {
    header = JSON.parse(await file.slice(MAGIC.length + 4, end).text()) as Header;
  } catch {
    throw new BackupError("damaged");
  }
  const k = header?.kdf;
  if (header?.v !== 1 || k?.v !== 1) throw new BackupError("unsupported");
  if (typeof k.salt !== "string" || typeof k.wrapped !== "string" || !Number.isInteger(k.iterations) || k.iterations < 1 || k.salt.length > 256 || k.wrapped.length > 512) throw new BackupError("damaged");
  if (k.iterations > MAX_ITERATIONS) throw new BackupError("unsupported");
  return { header, end };
}

/** When a backup was made, without opening it. The date is confirmed once the passphrase has opened the file. */
export async function backupDate(file: Blob): Promise<string> {
  return (await readHeader(file)).header.createdAt;
}

export interface OpenedBackup {
  createdAt: string;
  state: Persisted;
  blobs: { id: string; size: number; read: () => Promise<Blob> }[];
}

/**
 * Open a backup. The state comes back checked and cleaned; originals are
 * decrypted one at a time, when `read` is called. Throws BackupError.
 */
export async function openBackup(file: Blob, passphrase: string): Promise<OpenedBackup> {
  const { header, end } = await readHeader(file);
  let key: CryptoKey;
  try {
    key = await openEnvelope(passphrase, header.kdf);
  } catch (e) {
    throw new BackupError(e instanceof WrongPassphraseError ? "wrong-passphrase" : "damaged");
  }
  if (end + 4 > file.size) throw new BackupError("damaged");
  const length = new DataView(await file.slice(end, end + 4).arrayBuffer()).getUint32(0, true);
  const dataStart = end + 4 + length;
  if (length > MAX_MANIFEST_BYTES || dataStart > file.size) throw new BackupError("damaged");
  let manifest: Manifest;
  try {
    manifest = await decryptJson<Manifest>(key, await file.slice(end + 4, dataStart).arrayBuffer(), "backup:manifest");
  } catch {
    throw new BackupError("damaged");
  }
  const state = validateState(manifest?.state);
  if (!state || !Array.isArray(manifest.blobs)) throw new BackupError("damaged");

  let at = dataStart;
  const blobs: OpenedBackup["blobs"] = [];
  for (const [i, b] of manifest.blobs.entries()) {
    if (typeof b?.id !== "string" || !Number.isInteger(b.size) || b.size < 0) throw new BackupError("damaged");
    const from = at;
    const to = at + b.size + OVERHEAD;
    if (to > file.size) throw new BackupError("damaged");
    const type = typeof b.type === "string" ? b.type : "";
    blobs.push({
      id: b.id,
      size: b.size,
      read: async () => {
        try {
          return new Blob([await decryptBytes(key, await file.slice(from, to).arrayBuffer(), `backup:blob:${i}:${b.id}`)], { type });
        } catch {
          throw new BackupError("damaged");
        }
      },
    });
    at = to;
  }
  // Anything after the last record was not written by the vault.
  if (at !== file.size) throw new BackupError("damaged");
  return { createdAt: typeof manifest.createdAt === "string" ? manifest.createdAt : header.createdAt, state, blobs };
}

/* --------------------------------------------------------------- Validation */

const KINDS: FileKind[] = ["pdf", "docx", "xlsx", "pptx", "txt", "csv", "image"];
const str = (v: unknown, max = 500): v is string => typeof v === "string" && v.length <= max;
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const size = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const hex = (v: unknown) => (typeof v === "string" && /^[0-9a-f]{64}$/.test(v) ? v : undefined);

function version(v: unknown): FileVersion | null {
  if (!obj(v) || !id(v.id) || !str(v.ext, 10) || !size(v.size) || !str(v.at, 40) || !str(v.ownerId, 64)) return null;
  return { id: v.id, ext: v.ext, size: v.size, at: v.at, ownerId: v.ownerId, sha256: hex(v.sha256) };
}

function file(v: unknown, folders: Set<string>, projects: Set<string>): VaultFile | null {
  if (!obj(v) || !id(v.id) || !str(v.name) || !str(v.ext, 10) || !KINDS.includes(v.kind as FileKind) || !size(v.size)) return null;
  if (!str(v.ownerId, 64) || !str(v.createdAt, 40) || !str(v.modifiedAt, 40)) return null;
  const name = sanitizeName(v.name);
  if (!name) return null;
  return {
    id: v.id,
    name,
    ext: v.ext.toLowerCase().replace(/[^a-z0-9]/g, ""),
    kind: v.kind as FileKind,
    size: v.size,
    // A file whose folder is gone goes to the top rather than vanish.
    folderId: id(v.folderId) && folders.has(v.folderId) ? v.folderId : "root",
    projectId: id(v.projectId) && projects.has(v.projectId) ? v.projectId : null,
    ownerId: v.ownerId,
    createdAt: v.createdAt,
    modifiedAt: v.modifiedAt,
    status: STATUSES.includes(v.status as FileStatus) ? (v.status as FileStatus) : "Draft",
    tags: list(v.tags)
      .filter((t): t is string => str(t, 80))
      .map((t) => sanitizeName(t))
      .filter(Boolean)
      .slice(0, 20),
    notes: str(v.notes, 4000) ? v.notes : "",
    favorite: v.favorite === true,
    pinned: v.pinned === true,
    visibility: v.visibility === "team" ? "team" : "private",
    sharedWithMe: v.sharedWithMe === true,
    archived: v.archived === true,
    deleted: v.deleted === true,
    pages: size(v.pages) ? Math.min(Math.floor(v.pages), 100_000) : 1,
    sample: v.sample === true,
    ...(str(v.mime, 120) && { mime: v.mime }),
    ...(hex(v.sha256) && { sha256: hex(v.sha256) }),
    ...(str(v.versionAt, 40) && { versionAt: v.versionAt }),
    ...(Array.isArray(v.versions) && { versions: v.versions.map(version).filter((x): x is FileVersion => x !== null) }),
    ...((v.protection === "view" || v.protection === "high") && { protection: v.protection }),
  };
}

/**
 * Check a state that comes from outside (a backup file) before it becomes the
 * vault. Entries that do not have the right shape are dropped, names are
 * cleaned, and references to things that do not exist are repaired. Returns
 * null when there is no usable vault in it.
 */
export function validateState(raw: unknown): Persisted | null {
  if (!obj(raw)) return null;
  const migrated = migrate(raw as Partial<Persisted>);
  if (!migrated) return null;

  const folders: Folder[] = [];
  const seen = new Set<string>();
  for (const f of list(migrated.folders)) {
    if (!obj(f) || !id(f.id) || !str(f.name) || seen.has(f.id)) continue;
    const name = sanitizeName(f.name);
    if (!name) continue;
    seen.add(f.id);
    folders.push({ id: f.id, name, parentId: id(f.parentId) ? f.parentId : null, ...(str(f.code, 20) && { code: f.code }), ...(str(f.index, 4) && { index: f.index }), ...(str(f.access, 80) && { access: f.access }) });
  }
  const root = folders.find((f) => f.id === "root");
  if (!root) return null;
  root.parentId = null;
  for (const f of folders) {
    if (f === root) continue;
    // Every folder hangs somewhere under the root, and never from itself.
    if (f.parentId === null || !seen.has(f.parentId) || f.parentId === f.id) f.parentId = "root";
  }
  // A loop of folders (a inside b inside a) would make the tree endless: cut it at the root.
  const parentOf = new Map(folders.map((f) => [f.id, f]));
  for (const f of folders) {
    const trail = new Set<string>([f.id]);
    for (let at = f; at.parentId !== null; ) {
      const parent = parentOf.get(at.parentId);
      if (!parent || trail.has(parent.id)) {
        at.parentId = at === root ? null : "root";
        break;
      }
      trail.add(parent.id);
      at = parent;
    }
  }

  const projects: Project[] = [];
  const projectIds = new Set<string>();
  for (const p of list(migrated.projects)) {
    if (!obj(p) || !id(p.id) || !str(p.name) || !str(p.code, 20) || projectIds.has(p.id) || !id(p.folderId) || !seen.has(p.folderId)) continue;
    const name = sanitizeName(p.name);
    if (!name) continue;
    projectIds.add(p.id);
    projects.push({
      id: p.id,
      code: sanitizeName(p.code) || name.slice(0, 3).toUpperCase(),
      name,
      period: str(p.period, 120) ? sanitizeName(p.period) : "",
      summary: str(p.summary, 2000) ? p.summary : "",
      storyYears: list(p.storyYears)
        .filter((y): y is string => str(y, 20))
        .slice(0, 20),
      folderId: p.folderId,
      archived: p.archived === true,
    });
  }

  const files: VaultFile[] = [];
  const fileIds = new Set<string>();
  for (const f of list(migrated.files)) {
    const clean = file(f, seen, projectIds);
    if (!clean || fileIds.has(clean.id)) continue;
    fileIds.add(clean.id);
    files.push(clean);
  }

  const activity: ActivityItem[] = [];
  for (const a of list(migrated.activity).slice(0, 500)) {
    if (!obj(a) || !id(a.id) || !str(a.at, 40) || !str(a.userId, 64) || !str(a.verb, 200) || !str(a.target, 600)) continue;
    activity.push({ id: a.id, at: a.at, userId: a.userId, verb: a.verb, target: a.target, projectId: id(a.projectId) && projectIds.has(a.projectId) ? a.projectId : null, kind: a.kind === "security" ? "security" : "file", ...(typeof a.code === "string" && /^[0-9A-Z]{3}-[0-9A-Z]{3}$/.test(a.code) && { code: a.code }) });
  }

  const profile: Record<string, unknown> = obj(migrated.profile) ? migrated.profile : {};
  return {
    schema: SCHEMA,
    files,
    folders,
    projects,
    activity,
    watermark: migrated.watermark !== false,
    personalMark: migrated.personalMark !== false,
    ...(migrated.privacy === true && { privacy: true }),
    ...(migrated.defaultProtection && { defaultProtection: migrated.defaultProtection }),
    profile: {
      name: (str(profile.name, 200) && sanitizeName(profile.name)) || DEFAULT_PROFILE.name,
      company: str(profile.company, 200) ? sanitizeName(profile.company) : "",
      email: str(profile.email, 200) ? profile.email.trim().slice(0, 120) : "",
    },
  };
}

