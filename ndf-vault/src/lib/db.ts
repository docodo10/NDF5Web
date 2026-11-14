import type { ActivityItem, Folder, Profile, Project, VaultFile } from "./types";
import { createEnvelope, decryptBytes, decryptJson, encryptBytes, encryptJson, openEnvelope, rewrapEnvelope, WrongPassphraseError, type KeyEnvelope } from "./crypto";

/**
 * Local storage for the vault: IndexedDB in this browser only. Nothing here is
 * sent anywhere.
 *
 * When the vault is protected by a passphrase, the saved state and every
 * stored original are encrypted before they are written, and the key lives in
 * memory only while the vault is unlocked. Records are read by their shape,
 * not by the current mode, so a conversion that was interrupted half-way can
 * still be read and is finished on the next unlock.
 *
 * Every call tolerates a browser that refuses storage (private window, blocked
 * site data): reads resolve empty, writes resolve false, and the app keeps
 * working in memory.
 */

const DB_NAME = "ndf-vault";
const DB_VERSION = 1;
const STATE = "state";
const BLOBS = "blobs";

/** Bump when the saved shape changes; `migrate` brings older saves forward. */
export const SCHEMA = 4;

export interface Persisted {
  schema: number;
  files: VaultFile[];
  folders: Folder[];
  projects: Project[];
  activity: ActivityItem[];
  watermark: boolean;
  personalMark: boolean;
  profile: Profile;
}

export const DEFAULT_PROFILE: Profile = { name: "Admin NDF5", company: "NDF5 Productions", email: "" };

/** Stored in clear: what is needed before the vault can be unlocked. Holds no document data. */
export interface Meta {
  protected: boolean;
  envelope?: KeyEnvelope;
  /** A conversion that did not finish and resumes at the next unlock. */
  pending?: "encrypt" | "decrypt";
  /** Wrong passphrases since the last successful unlock. */
  failed: number;
  lastFailedAt?: string;
  /** Lock after this many minutes without activity; 0 never locks. */
  autoLockMinutes: number;
}

const DEFAULT_META: Meta = { protected: false, failed: 0, autoLockMinutes: 15 };

type StoredBlob = Blob | { enc: ArrayBuffer; type: string };
type StoredState = Persisted | { enc: ArrayBuffer };

const isSealed = (r: unknown): r is { enc: ArrayBuffer } => typeof r === "object" && r !== null && "enc" in r;

/** The data key, in memory only, while the vault is unlocked. */
let dataKey: CryptoKey | null = null;
/** Whether new writes must be encrypted. */
let sealing = false;

let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STATE)) db.createObjectStore(STATE);
        if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

/** One transaction on one store. Resolves the request's result, or null when anything fails. */
function run<T>(store: string, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const tx = db.transaction(store, mode);
          const req = work(tx.objectStore(store));
          let value: T | null = null;
          if (req) req.onsuccess = () => (value = req.result ?? null);
          tx.oncomplete = () => resolve(value);
          tx.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

/** Like `run` for a write, but tells whether it was committed. */
function write(store: string, work: (s: IDBObjectStore) => void): Promise<boolean> {
  return open().then(
    (db) =>
      new Promise<boolean>((resolve) => {
        if (!db) return resolve(false);
        try {
          const tx = db.transaction(store, "readwrite");
          work(tx.objectStore(store));
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false);
        } catch {
          resolve(false);
        }
      }),
  );
}

export async function isAvailable(): Promise<boolean> {
  return (await open()) !== null;
}

/* --------------------------------------------------------------------- Meta */

export async function readMeta(): Promise<Meta> {
  const saved = await run<Partial<Meta>>(STATE, "readonly", (st) => st.get("meta"));
  const meta = { ...DEFAULT_META, ...(saved ?? {}) };
  // A pending "decrypt" already writes in clear; everything else follows the protection flag.
  if (!dataKey) sealing = meta.protected && meta.pending !== "decrypt";
  return meta;
}

async function writeMeta(meta: Meta): Promise<boolean> {
  return write(STATE, (st) => st.put(meta, "meta"));
}

export async function setAutoLock(minutes: number): Promise<void> {
  await writeMeta({ ...(await readMeta()), autoLockMinutes: minutes });
}

export function isUnlocked(): boolean {
  return dataKey !== null;
}

/* --------------------------------------------------------- Lock and unlock */

export type UnlockResult = { ok: true; failedBefore: number; lastFailedAt?: string } | { ok: false; failed: number };

export async function unlock(passphrase: string): Promise<UnlockResult> {
  const meta = await readMeta();
  if (!meta.protected || !meta.envelope) return { ok: true, failedBefore: 0 };
  try {
    dataKey = await openEnvelope(passphrase, meta.envelope);
  } catch (e) {
    if (!(e instanceof WrongPassphraseError)) throw e;
    const failed = meta.failed + 1;
    await writeMeta({ ...meta, failed, lastFailedAt: new Date().toISOString() });
    return { ok: false, failed };
  }
  const result: UnlockResult = { ok: true, failedBefore: meta.failed, lastFailedAt: meta.lastFailedAt };
  let next: Meta = { ...meta, failed: 0, lastFailedAt: undefined };
  if (meta.pending === "encrypt") {
    sealing = true;
    await convertAll("encrypt");
    next = { ...next, pending: undefined };
  } else if (meta.pending === "decrypt") {
    sealing = false;
    await convertAll("decrypt");
    next = { ...DEFAULT_META, autoLockMinutes: meta.autoLockMinutes };
    dataKey = null;
  } else {
    sealing = true;
  }
  await writeMeta(next);
  return result;
}

/** Forget the key. Everything stored stays encrypted and unreadable until the next unlock. */
export function lock(): void {
  dataKey = null;
}

/** Turn protection on: from now on everything is written encrypted, and what is already stored is converted. */
export async function enableProtection(passphrase: string, iterations?: number): Promise<boolean> {
  const meta = await readMeta();
  if (meta.protected) return false;
  const { envelope, key } = await createEnvelope(passphrase, iterations);
  if (!(await writeMeta({ ...meta, protected: true, envelope, pending: "encrypt", failed: 0 }))) return false;
  dataKey = key;
  sealing = true;
  await convertAll("encrypt");
  await writeMeta({ ...meta, protected: true, envelope, pending: undefined, failed: 0 });
  return true;
}

/** Turn protection off, after checking the passphrase: everything is written back in clear. */
export async function disableProtection(passphrase: string): Promise<boolean> {
  const meta = await readMeta();
  if (!meta.protected || !meta.envelope) return false;
  try {
    dataKey = await openEnvelope(passphrase, meta.envelope);
  } catch (e) {
    if (e instanceof WrongPassphraseError) return false;
    throw e;
  }
  await writeMeta({ ...meta, pending: "decrypt" });
  sealing = false;
  await convertAll("decrypt");
  await writeMeta({ ...DEFAULT_META, autoLockMinutes: meta.autoLockMinutes });
  dataKey = null;
  return true;
}

/** Change the passphrase. The stored data is untouched: only the key's wrapping changes. */
export async function changePassphrase(current: string, next: string, iterations?: number): Promise<boolean> {
  const meta = await readMeta();
  if (!meta.protected || !meta.envelope) return false;
  try {
    const envelope = await rewrapEnvelope(current, next, meta.envelope, iterations);
    return writeMeta({ ...meta, envelope });
  } catch (e) {
    if (e instanceof WrongPassphraseError) return false;
    throw e;
  }
}

/** Bring every stored record to one form. Safe to run again: records already converted are skipped. */
async function convertAll(mode: "encrypt" | "decrypt"): Promise<void> {
  const key = dataKey;
  if (!key) return;
  const ids = (await run<IDBValidKey[]>(BLOBS, "readonly", (st) => st.getAllKeys())) ?? [];
  for (const rawId of ids) {
    const id = String(rawId);
    const rec = await run<StoredBlob>(BLOBS, "readonly", (st) => st.get(id));
    if (!rec) continue;
    if (mode === "encrypt" && !isSealed(rec)) {
      const enc = await encryptBytes(key, await rec.arrayBuffer(), `blob:${id}`);
      await write(BLOBS, (st) => st.put({ enc, type: rec.type }, id));
    } else if (mode === "decrypt" && isSealed(rec)) {
      try {
        const clear = await decryptBytes(key, rec.enc, `blob:${id}`);
        await write(BLOBS, (st) => st.put(new Blob([clear], { type: rec.type }), id));
      } catch {
        /* an unreadable record stays as it is */
      }
    }
  }
  const state = await run<StoredState>(STATE, "readonly", (st) => st.get("vault"));
  if (!state) return;
  if (mode === "encrypt" && !isSealed(state)) {
    const enc = await encryptJson(key, state, "state");
    await write(STATE, (st) => st.put({ enc }, "vault"));
  } else if (mode === "decrypt" && isSealed(state)) {
    try {
      const clear = await decryptJson<Persisted>(key, state.enc, "state");
      await write(STATE, (st) => st.put(clear, "vault"));
    } catch {
      /* unreadable */
    }
  }
}

/* -------------------------------------------------------------------- State */

/** Bring an older save to the current shape. Returns null for a save this version cannot read. */
export function migrate(saved: Partial<Persisted> & { schema?: number }): Persisted | null {
  if (!saved || !Array.isArray(saved.files) || !Array.isArray(saved.folders)) return null;
  if (saved.schema !== 3 && saved.schema !== SCHEMA) return null;
  return {
    schema: SCHEMA,
    files: saved.files,
    folders: saved.folders,
    projects: saved.projects ?? [],
    activity: saved.activity ?? [],
    watermark: saved.watermark ?? true,
    personalMark: saved.personalMark ?? true,
    profile: { ...DEFAULT_PROFILE, ...(saved.profile ?? {}) },
  };
}

export type LoadResult = { status: "empty" } | { status: "ok"; state: Persisted } | { status: "locked" } | { status: "unreadable" };

export async function loadState(): Promise<LoadResult> {
  const rec = await run<StoredState>(STATE, "readonly", (st) => st.get("vault"));
  if (!rec) return { status: "empty" };
  let raw: Persisted;
  if (isSealed(rec)) {
    if (!dataKey) return { status: "locked" };
    try {
      raw = await decryptJson<Persisted>(dataKey, rec.enc, "state");
    } catch {
      return { status: "unreadable" };
    }
  } else raw = rec;
  const state = migrate(raw);
  return state ? { status: "ok", state } : { status: "unreadable" };
}

export async function saveState(state: Persisted): Promise<boolean> {
  if (!sealing) return write(STATE, (st) => st.put(state, "vault"));
  const key = dataKey;
  if (!key) return false;
  const enc = await encryptJson(key, state, "state");
  return write(STATE, (st) => st.put({ enc }, "vault"));
}

/* -------------------------------------------------------------------- Blobs */

/** Store an original. Resolves false when the browser refused (for example, quota) or the vault is locked. */
export async function putBlob(id: string, blob: Blob): Promise<boolean> {
  if (!sealing) return write(BLOBS, (st) => st.put(blob, id));
  const key = dataKey;
  if (!key) return false;
  const enc = await encryptBytes(key, await blob.arrayBuffer(), `blob:${id}`);
  return write(BLOBS, (st) => st.put({ enc, type: blob.type }, id));
}

export type BlobResult = { status: "ok"; blob: Blob } | { status: "missing" } | { status: "locked" } | { status: "corrupt" };

/** Read an original, saying why when it cannot be read. */
export async function readBlob(id: string): Promise<BlobResult> {
  const rec = await run<StoredBlob>(BLOBS, "readonly", (st) => st.get(id));
  if (!rec) return { status: "missing" };
  if (!isSealed(rec)) return { status: "ok", blob: rec };
  if (!dataKey) return { status: "locked" };
  try {
    return { status: "ok", blob: new Blob([await decryptBytes(dataKey, rec.enc, `blob:${id}`)], { type: rec.type }) };
  } catch {
    // The authentication tag does not match: the record was altered, or belongs to another slot.
    return { status: "corrupt" };
  }
}

export async function getBlob(id: string): Promise<Blob | null> {
  const r = await readBlob(id);
  return r.status === "ok" ? r.blob : null;
}

export async function deleteBlobs(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await write(BLOBS, (st) => {
    for (const id of ids) st.delete(id);
  });
}

/** Erase the documents and the saved state. Protection settings stay. */
export async function clearData(): Promise<void> {
  await write(STATE, (st) => st.delete("vault"));
  await write(BLOBS, (st) => st.clear());
}

/** Erase everything, protection included: the way out when the passphrase is lost. */
export async function wipeEverything(): Promise<void> {
  dataKey = null;
  sealing = false;
  await write(STATE, (st) => st.clear());
  await write(BLOBS, (st) => st.clear());
}

/* ------------------------------------------------------------ Device storage */

export async function storageUsage(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage.estimate();
    return typeof e.usage === "number" && typeof e.quota === "number" ? { usage: e.usage, quota: e.quota } : null;
  } catch {
    return null;
  }
}

/** Ask the browser not to evict this site's data when the disk runs low. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}

/** For tests: forget the connection and the in-memory key, as a fresh page load would. */
export function resetForTests(): void {
  opening = null;
  dataKey = null;
  sealing = false;
}
