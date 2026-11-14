import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import * as db from "@/lib/db";
import type { Persisted } from "@/lib/db";

const FAST = 1000;
const PASS = "tortue lampe orage fenêtre";

const state = (name = "Contrat confidentiel"): Persisted => ({
  schema: db.SCHEMA,
  files: [{ id: "f-1", name, ext: "pdf" } as Persisted["files"][number]],
  folders: [{ id: "root", name: "NDF SAGA", parentId: null }],
  projects: [],
  activity: [],
  watermark: true,
  personalMark: true,
  profile: db.DEFAULT_PROFILE,
});

const blob = (text: string, type = "application/pdf") => new Blob([text], { type });

/** Everything the database holds, as one string: what someone reading the disk would see. */
async function rawDump(): Promise<string> {
  const conn = await new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open("ndf-vault");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  let out = "";
  for (const store of ["state", "blobs"]) {
    const records = await new Promise<unknown[]>((res) => {
      const r = conn.transaction(store).objectStore(store).getAll();
      r.onsuccess = () => res(r.result);
    });
    for (const rec of records) {
      if (rec instanceof Blob) out += await rec.text();
      else if (rec && typeof rec === "object" && "enc" in rec) out += new TextDecoder("latin1").decode(new Uint8Array((rec as { enc: ArrayBuffer }).enc)) + JSON.stringify({ ...(rec as object), enc: undefined });
      else out += JSON.stringify(rec);
    }
  }
  conn.close();
  return out;
}

/** Simulate closing the page and opening it again: no key in memory. */
function reopen() {
  db.resetForTests();
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  db.resetForTests();
});

describe("unprotected vault", () => {
  it("saves and loads the state and the originals", async () => {
    expect(await db.loadState()).toEqual({ status: "empty" });
    expect(await db.saveState(state())).toBe(true);
    expect(await db.putBlob("f-1", blob("%PDF original"))).toBe(true);
    reopen();
    const loaded = await db.loadState();
    expect(loaded.status).toBe("ok");
    expect(loaded.status === "ok" && loaded.state.files[0].name).toBe("Contrat confidentiel");
    const b = await db.getBlob("f-1");
    expect(await b?.text()).toBe("%PDF original");
    expect(b?.type).toBe("application/pdf");
  });

  it("reports a missing original", async () => {
    expect(await db.readBlob("nope")).toEqual({ status: "missing" });
    expect(await db.getBlob("nope")).toBeNull();
  });

  it("starts unprotected with sensible defaults", async () => {
    expect(await db.readMeta()).toMatchObject({ protected: false, failed: 0, autoLockMinutes: 15 });
  });
});

describe("protected vault", () => {
  beforeEach(async () => {
    await db.saveState(state());
    await db.putBlob("f-1", blob("%PDF plan financier secret"));
    await db.putBlob("f-2", blob("notes privées", "text/plain"));
    expect(await db.enableProtection(PASS, FAST)).toBe(true);
  });

  it("leaves nothing readable on disk", async () => {
    const dump = await rawDump();
    expect(dump).not.toContain("plan financier secret");
    expect(dump).not.toContain("notes privées");
    expect(dump).not.toContain("Contrat confidentiel");
    expect(dump).not.toContain(PASS);
  });

  it("encrypts what is written afterwards too", async () => {
    await db.putBlob("f-3", blob("ajouté après l’activation"));
    await db.saveState(state("Nouveau nom sensible"));
    const dump = await rawDump();
    expect(dump).not.toContain("ajouté après");
    expect(dump).not.toContain("Nouveau nom sensible");
    expect(await (await db.getBlob("f-3"))?.text()).toBe("ajouté après l’activation");
  });

  it("is unreadable after reopening, until unlocked", async () => {
    reopen();
    expect((await db.readMeta()).protected).toBe(true);
    expect(db.isUnlocked()).toBe(false);
    expect(await db.loadState()).toEqual({ status: "locked" });
    expect(await db.readBlob("f-1")).toEqual({ status: "locked" });
    expect(await db.getBlob("f-1")).toBeNull();
    // A locked vault refuses writes rather than storing them in clear.
    expect(await db.putBlob("f-9", blob("fuite"))).toBe(false);
    expect(await db.saveState(state("fuite"))).toBe(false);
    expect(await rawDump()).not.toContain("fuite");
  });

  it("unlocks with the passphrase and gives everything back", async () => {
    reopen();
    expect(await db.unlock(PASS)).toMatchObject({ ok: true, failedBefore: 0 });
    const loaded = await db.loadState();
    expect(loaded.status === "ok" && loaded.state.files[0].name).toBe("Contrat confidentiel");
    const b = await db.getBlob("f-2");
    expect(await b?.text()).toBe("notes privées");
    expect(b?.type).toBe("text/plain");
  });

  it("refuses a wrong passphrase and counts the attempts", async () => {
    reopen();
    expect(await db.unlock("mauvaise phrase")).toEqual({ ok: false, failed: 1 });
    expect(await db.unlock("encore fausse")).toEqual({ ok: false, failed: 2 });
    expect(db.isUnlocked()).toBe(false);
    expect(await db.loadState()).toEqual({ status: "locked" });
    const ok = await db.unlock(PASS);
    expect(ok).toMatchObject({ ok: true, failedBefore: 2 });
    expect(ok.ok && ok.lastFailedAt).toBeTruthy();
    // The counter starts again after a success.
    reopen();
    expect(await db.unlock(PASS)).toMatchObject({ ok: true, failedBefore: 0 });
  });

  it("locks again on demand", async () => {
    db.lock();
    expect(db.isUnlocked()).toBe(false);
    expect(await db.getBlob("f-1")).toBeNull();
    expect(await db.loadState()).toEqual({ status: "locked" });
  });

  it("detects an original altered on disk", async () => {
    const conn = await new Promise<IDBDatabase>((res) => {
      const r = indexedDB.open("ndf-vault");
      r.onsuccess = () => res(r.result);
    });
    const rec = await new Promise<{ enc: ArrayBuffer; type: string }>((res) => {
      const r = conn.transaction("blobs").objectStore("blobs").get("f-1");
      r.onsuccess = () => res(r.result);
    });
    const tampered = new Uint8Array(rec.enc.slice(0));
    tampered[tampered.length - 3] ^= 0xff;
    await new Promise<void>((res) => {
      const tx = conn.transaction("blobs", "readwrite");
      tx.objectStore("blobs").put({ enc: tampered.buffer, type: rec.type }, "f-1");
      tx.oncomplete = () => res();
    });
    conn.close();
    expect(await db.readBlob("f-1")).toEqual({ status: "corrupt" });
    expect(await db.readBlob("f-2")).toMatchObject({ status: "ok" });
  });

  it("refuses an encrypted original copied over another file", async () => {
    const conn = await new Promise<IDBDatabase>((res) => {
      const r = indexedDB.open("ndf-vault");
      r.onsuccess = () => res(r.result);
    });
    const rec = await new Promise<unknown>((res) => {
      const r = conn.transaction("blobs").objectStore("blobs").get("f-2");
      r.onsuccess = () => res(r.result);
    });
    await new Promise<void>((res) => {
      const tx = conn.transaction("blobs", "readwrite");
      tx.objectStore("blobs").put(rec, "f-1");
      tx.oncomplete = () => res();
    });
    conn.close();
    expect(await db.readBlob("f-1")).toEqual({ status: "corrupt" });
  });

  it("changes the passphrase without touching the data", async () => {
    const before = await rawDump();
    expect(await db.changePassphrase("pas la bonne", "nouvelle phrase secrète", FAST)).toBe(false);
    expect(await db.changePassphrase(PASS, "nouvelle phrase secrète", FAST)).toBe(true);
    // Only the wrapped key changed; the encrypted records are byte-for-byte the same.
    const after = await rawDump();
    expect(after.length).toBe(before.length);
    reopen();
    expect(await db.unlock(PASS)).toMatchObject({ ok: false });
    expect(await db.unlock("nouvelle phrase secrète")).toMatchObject({ ok: true });
    expect(await (await db.getBlob("f-1"))?.text()).toBe("%PDF plan financier secret");
  });

  it("turns protection off only with the passphrase, and writes everything back in clear", async () => {
    expect(await db.disableProtection("pas la bonne")).toBe(false);
    expect((await db.readMeta()).protected).toBe(true);
    expect(await db.disableProtection(PASS)).toBe(true);
    const meta = await db.readMeta();
    expect(meta.protected).toBe(false);
    expect(meta.envelope).toBeUndefined();
    reopen();
    expect(await (await db.getBlob("f-1"))?.text()).toBe("%PDF plan financier secret");
    const loaded = await db.loadState();
    expect(loaded.status === "ok" && loaded.state.files[0].name).toBe("Contrat confidentiel");
  });

  it("cannot be enabled twice", async () => {
    expect(await db.enableProtection("une autre phrase secrète", FAST)).toBe(false);
  });

  it("clearing the data keeps the protection", async () => {
    await db.clearData();
    expect(await db.loadState()).toEqual({ status: "empty" });
    expect(await db.getBlob("f-1")).toBeNull();
    expect((await db.readMeta()).protected).toBe(true);
  });

  it("wiping everything removes the protection and all content", async () => {
    reopen();
    await db.wipeEverything();
    expect((await db.readMeta()).protected).toBe(false);
    expect(await db.loadState()).toEqual({ status: "empty" });
    expect(await rawDump()).toBe("");
  });
});

describe("interrupted conversion", () => {
  it("still reads a vault left half encrypted, and finishes at the next unlock", async () => {
    await db.putBlob("old", blob("écrit avant la protection"));
    expect(await db.enableProtection(PASS, FAST)).toBe(true);
    // Put one record back in clear and flag the conversion as unfinished, as a crash mid-way would leave it.
    const conn = await new Promise<IDBDatabase>((res) => {
      const r = indexedDB.open("ndf-vault");
      r.onsuccess = () => res(r.result);
    });
    const meta = await db.readMeta();
    await new Promise<void>((res) => {
      const tx = conn.transaction(["blobs", "state"], "readwrite");
      tx.objectStore("blobs").put(blob("resté en clair"), "old");
      tx.objectStore("state").put({ ...meta, pending: "encrypt" }, "meta");
      tx.oncomplete = () => res();
    });
    conn.close();
    reopen();
    expect(await db.unlock(PASS)).toMatchObject({ ok: true });
    expect(await (await db.getBlob("old"))?.text()).toBe("resté en clair");
    expect(await rawDump()).not.toContain("resté en clair");
    expect((await db.readMeta()).pending).toBeUndefined();
  });
});

describe("saved state", () => {
  it("brings an older save forward instead of discarding it", () => {
    const old = { schema: 3, files: [], folders: [], projects: [], activity: [], watermark: false };
    expect(db.migrate(old)).toMatchObject({ schema: db.SCHEMA, watermark: false, personalMark: true, profile: db.DEFAULT_PROFILE });
  });

  it("rejects a save it cannot understand", () => {
    expect(db.migrate({ schema: 1, files: [], folders: [] })).toBeNull();
    expect(db.migrate({ schema: db.SCHEMA } as never)).toBeNull();
  });

  it("treats a corrupt encrypted state as unreadable, not as empty", async () => {
    await db.saveState(state());
    await db.enableProtection(PASS, FAST);
    const conn = await new Promise<IDBDatabase>((res) => {
      const r = indexedDB.open("ndf-vault");
      r.onsuccess = () => res(r.result);
    });
    await new Promise<void>((res) => {
      const tx = conn.transaction("state", "readwrite");
      tx.objectStore("state").put({ enc: new Uint8Array(64).buffer }, "vault");
      tx.oncomplete = () => res();
    });
    conn.close();
    expect(await db.loadState()).toEqual({ status: "unreadable" });
  });
});
