import type { ActivityItem, Folder, Project, VaultFile } from "./types";

/**
 * Local storage for the vault: IndexedDB in this browser only.
 * Nothing here is sent anywhere. Every call tolerates a browser that refuses
 * storage (private window, blocked site data): reads resolve null, writes
 * resolve false, and the app keeps working in memory.
 */

const DB_NAME = "ndf-vault";
const DB_VERSION = 1;
const STATE = "state";
const BLOBS = "blobs";

/** Bump when the saved shape or the built-in sample data changes incompatibly. */
export const SCHEMA = 3;

export interface Persisted {
  schema: number;
  files: VaultFile[];
  folders: Folder[];
  projects: Project[];
  activity: ActivityItem[];
  watermark: boolean;
}

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

export async function isAvailable(): Promise<boolean> {
  return (await open()) !== null;
}

export async function loadState(): Promise<Persisted | null> {
  const s = await run<Persisted>(STATE, "readonly", (st) => st.get("vault"));
  return s && s.schema === SCHEMA ? s : null;
}

export async function saveState(state: Persisted): Promise<boolean> {
  if (!(await open())) return false;
  await run(STATE, "readwrite", (st) => {
    st.put(state, "vault");
  });
  return true;
}

/** Store an uploaded original. Resolves false when the browser refused (for example, quota). */
export async function putBlob(id: string, blob: Blob): Promise<boolean> {
  const db = await open();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(BLOBS, "readwrite");
      tx.objectStore(BLOBS).put(blob, id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export function getBlob(id: string): Promise<Blob | null> {
  return run<Blob>(BLOBS, "readonly", (st) => st.get(id));
}

export async function deleteBlobs(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await run(BLOBS, "readwrite", (st) => {
    for (const id of ids) st.delete(id);
  });
}

export async function clearAll(): Promise<void> {
  await run(STATE, "readwrite", (st) => {
    st.clear();
  });
  await run(BLOBS, "readwrite", (st) => {
    st.clear();
  });
}
