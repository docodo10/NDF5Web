import { describe, expect, it } from "vitest";
import { backupDate, BackupError, createBackup, openBackup, validateState } from "@/lib/backup";
import { DEFAULT_PROFILE, SCHEMA, type Persisted } from "@/lib/db";
import { FILES, FOLDERS, PROJECTS } from "@/lib/sample-data";
import type { VaultFile } from "@/lib/types";

const FAST = 1000;
const PASS = "sauvegarde orage tortue lampe";
const NOW = new Date("2026-11-14T20:04:00.000Z");

const uploaded = (id: string, name: string, extra: Partial<VaultFile> = {}): VaultFile => ({ ...FILES[0], id, name, sample: false, folderId: "legal", projectId: null, ...extra });

const state = (files: VaultFile[] = [uploaded("f-a1", "Contrat signé"), uploaded("f-b2", "Budget détaillé")]): Persisted => ({
  schema: SCHEMA,
  files,
  folders: FOLDERS,
  projects: PROJECTS,
  activity: [{ id: "a-1", at: "2026-11-14T15:04:00", userId: "u-admin", verb: "a téléversé", target: "Contrat signé.pdf", projectId: null, kind: "file" }],
  watermark: true,
  personalMark: false,
  profile: { name: "Admin NDF5", company: "NDF5 Productions", email: "" },
});

const originals = () => [
  { id: "f-a1", data: new Blob(["%PDF contrat confidentiel"], { type: "application/pdf" }) },
  { id: "f-b2", data: new Blob(["poste;montant secret"], { type: "text/csv" }) },
];

const problem = async (work: Promise<unknown>) => {
  try {
    await work;
  } catch (e) {
    return e instanceof BackupError ? e.problem : `other: ${String(e)}`;
  }
  return "no error";
};

const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

describe("encrypted backup", () => {
  it("round-trips the state and every original", async () => {
    const backup = await createBackup(PASS, state(), originals(), { iterations: FAST, now: NOW });
    const opened = await openBackup(backup, PASS);
    expect(opened.createdAt).toBe(NOW.toISOString());
    expect(opened.state.files.map((f) => f.name)).toEqual(["Contrat signé", "Budget détaillé"]);
    expect(opened.state.personalMark).toBe(false);
    expect(opened.blobs.map((b) => [b.id, b.size])).toEqual([["f-a1", 25], ["f-b2", 20]]);
    const first = await opened.blobs[0].read();
    expect(await first.text()).toBe("%PDF contrat confidentiel");
    expect(first.type).toBe("application/pdf");
    expect(await (await opened.blobs[1].read()).text()).toBe("poste;montant secret");
  });

  it("shows nothing of the vault without the passphrase", async () => {
    const backup = await createBackup(PASS, state(), originals(), { iterations: FAST, now: NOW });
    const raw = new TextDecoder("latin1").decode(await backup.arrayBuffer());
    for (const secret of ["contrat confidentiel", "montant secret", "Contrat sign", "Budget", "f-a1", "application/pdf", "Juridique", PASS]) expect(raw, secret).not.toContain(secret);
    // Only the date and the key-derivation parameters are in clear.
    expect(await backupDate(backup)).toBe(NOW.toISOString());
  });

  it("refuses a wrong passphrase", async () => {
    const backup = await createBackup(PASS, state(), originals(), { iterations: FAST });
    expect(await problem(openBackup(backup, "pas la bonne phrase"))).toBe("wrong-passphrase");
  });

  it("refuses files that are not backups", async () => {
    expect(await problem(openBackup(new Blob(["%PDF-1.7 un document ordinaire"]), PASS))).toBe("not-a-backup");
    expect(await problem(openBackup(new Blob([]), PASS))).toBe("not-a-backup");
    expect(await problem(backupDate(new Blob(["NDFVAULT-BACKUP\n\u0005\u0000\u0000\u0000{oops"])))).toBe("damaged");
  });

  it("detects any change to the file", async () => {
    const backup = await createBackup(PASS, state(), originals(), { iterations: FAST });
    const bytes = await bytesOf(backup);
    // A flipped bit in the last original.
    const flipped = bytes.slice();
    flipped[flipped.length - 20] ^= 1;
    const opened = await openBackup(new Blob([flipped]), PASS);
    expect(await (await opened.blobs[0].read()).text()).toBe("%PDF contrat confidentiel");
    expect(await problem(opened.blobs[1].read())).toBe("damaged");
    // A truncated file, and one with something appended.
    expect(await problem(openBackup(new Blob([bytes.slice(0, bytes.length - 10)]), PASS))).toBe("damaged");
    expect(await problem(openBackup(new Blob([bytes, new Uint8Array(4)]), PASS))).toBe("damaged");
    // A flipped bit in the encrypted manifest.
    const manifest = bytes.slice();
    manifest[400] ^= 1;
    expect(await problem(openBackup(new Blob([manifest]), PASS))).toBe("damaged");
  });

  it("refuses originals swapped with one another", async () => {
    const same = [
      { id: "f-a1", data: new Blob(["AAAAAAAAAAAAAAAAAAAA"]) },
      { id: "f-b2", data: new Blob(["BBBBBBBBBBBBBBBBBBBB"]) },
    ];
    const backup = await createBackup(PASS, state(), same, { iterations: FAST });
    const bytes = await bytesOf(backup);
    const record = 20 + 28;
    const swapped = bytes.slice();
    swapped.set(bytes.subarray(bytes.length - record), bytes.length - 2 * record);
    swapped.set(bytes.subarray(bytes.length - 2 * record, bytes.length - record), bytes.length - record);
    const opened = await openBackup(new Blob([swapped]), PASS);
    expect(await problem(opened.blobs[0].read())).toBe("damaged");
    expect(await problem(opened.blobs[1].read())).toBe("damaged");
  });

  it("refuses a header that asks for an absurd amount of work", async () => {
    const header = JSON.stringify({ v: 1, createdAt: NOW.toISOString(), kdf: { v: 1, salt: "AAAA", iterations: 2_000_000_000, wrapped: "AAAA" } });
    const length = new Uint8Array(4);
    new DataView(length.buffer).setUint32(0, header.length, true);
    expect(await problem(openBackup(new Blob(["NDFVAULT-BACKUP\n", length, header]), PASS))).toBe("unsupported");
    // The same goes for a memory-hard header that asks for gigabytes.
    const greedy = JSON.stringify({ v: 1, createdAt: NOW.toISOString(), kdf: { v: 2, salt: "AAAA", iterations: 0, scrypt: { n: 2 ** 26, r: 8, p: 1 }, wrapped: "AAAA" } });
    new DataView(length.buffer).setUint32(0, greedy.length, true);
    expect(await problem(openBackup(new Blob(["NDFVAULT-BACKUP\n", length, greedy]), PASS))).toBe("unsupported");
  });

  it("uses the recommended key stretching by default", async () => {
    const backup = await createBackup(PASS, state([]), []);
    const text = new TextDecoder("latin1").decode(await backup.slice(0, 300).arrayBuffer());
    expect(text).toContain('"scrypt":{"n":65536,"r":8,"p":2}');
    expect((await openBackup(backup, PASS)).state.files).toEqual([]);
  });
});

describe("checking a restored state", () => {
  const base = () => JSON.parse(JSON.stringify(state())) as Record<string, unknown> & { files: Record<string, unknown>[]; folders: Record<string, unknown>[]; projects: Record<string, unknown>[]; activity: Record<string, unknown>[] };

  it("keeps a valid state as it is", () => {
    const clean = validateState(base())!;
    expect(clean.files).toHaveLength(2);
    expect(clean.folders).toHaveLength(FOLDERS.length);
    expect(clean.projects).toHaveLength(PROJECTS.length);
    expect(clean.activity).toHaveLength(1);
  });

  it("rejects what is not a vault at all", () => {
    for (const bad of [null, 42, "texte", [], {}, { schema: SCHEMA, files: "non", folders: [] }, { schema: 999, files: [], folders: [] }]) expect(validateState(bad)).toBeNull();
    const noRoot = base();
    noRoot.folders = noRoot.folders.filter((f) => f.id !== "root");
    expect(validateState(noRoot)).toBeNull();
  });

  it("drops entries that do not have the right shape", () => {
    const s = base();
    s.files.push({ id: "f-x" }, { ...s.files[0], id: "../../etc" }, { ...s.files[0], id: "f-ok", kind: "exe" }, { ...s.files[0], id: "f-neg", size: -1 }, { ...s.files[0] }, "pas un fichier" as never, null as never);
    s.activity.push({ id: "a-2" }, { ...s.activity[0], id: "a-3", verb: 7 });
    const clean = validateState(s)!;
    expect(clean.files.map((f) => f.id)).toEqual(["f-a1", "f-b2"]);
    expect(clean.activity).toHaveLength(1);
  });

  it("cleans names and repairs references to things that do not exist", () => {
    const s = base();
    s.files[0] = { ...s.files[0], name: "rapport‮fdp/../x", folderId: "dossier-inexistant", projectId: "projet-inexistant", status: "Inventé", tags: ["ok", 7, "  "], versions: [{ id: "v-1", ext: "pdf", size: 3, at: "2026-11-01T10:00:00", ownerId: "u-admin", sha256: "pas-une-empreinte" }, { id: "v-2" }] };
    const clean = validateState(s)!;
    const f = clean.files[0];
    expect(f.name).toBe("rapportfdp-..-x");
    expect(f.folderId).toBe("root");
    expect(f.projectId).toBeNull();
    expect(f.status).toBe("Draft");
    expect(f.tags).toEqual(["ok"]);
    expect(f.versions).toEqual([{ id: "v-1", ext: "pdf", size: 3, at: "2026-11-01T10:00:00", ownerId: "u-admin", sha256: undefined }]);
  });

  it("breaks folder loops and re-attaches orphans, so the tree always ends at the root", () => {
    const s = base();
    s.folders.push({ id: "x-a", name: "A", parentId: "x-b" }, { id: "x-b", name: "B", parentId: "x-a" }, { id: "x-self", name: "Soi", parentId: "x-self" }, { id: "x-orphan", name: "Orphelin", parentId: "nulle-part" });
    const clean = validateState(s)!;
    const byId = new Map(clean.folders.map((f) => [f.id, f]));
    for (const f of clean.folders) {
      let steps = 0;
      for (let at = f; at.parentId !== null; at = byId.get(at.parentId)!) expect(++steps).toBeLessThan(50);
    }
    expect(byId.get("x-self")!.parentId).toBe("root");
    expect(byId.get("x-orphan")!.parentId).toBe("root");
    expect(byId.get("root")!.parentId).toBeNull();
  });

  it("falls back to the default profile and settings", () => {
    const s = base();
    delete s.profile;
    delete s.watermark;
    const clean = validateState(s)!;
    expect(clean.profile).toEqual(DEFAULT_PROFILE);
    expect(clean.watermark).toBe(true);
  });
});
