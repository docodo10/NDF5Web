import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { createEnvelope, createRecovery, decryptBytes, encryptBytes, generateRecoveryCode, normalizeRecoveryCode, openEnvelope, recoverEnvelope, WrongPassphraseError } from "@/lib/crypto";
import * as db from "@/lib/db";
import type { Persisted } from "@/lib/db";

const FAST = 1000;
const PASS = "tortue lampe orage fenêtre";
const NEXT = "nouvelle phrase bien plus longue";
const text = (b: ArrayBuffer) => new TextDecoder().decode(b);

describe("recovery code", () => {
  it("is six groups of four unambiguous characters, different every time", () => {
    const codes = Array.from({ length: 200 }, generateRecoveryCode);
    for (const c of codes) expect(c).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(new Set(codes).size).toBe(200);
    // Every character of the alphabet turns up: the bits are spread, not stuck.
    expect(new Set(codes.join("").replace(/-/g, "")).size).toBe(32);
  });

  it("forgives how a person types it back", () => {
    const code = "0A1B-2C3D-4E5F-6G7H-8J9K-MNPQ";
    expect(normalizeRecoveryCode(code)).toBe(code);
    expect(normalizeRecoveryCode("  0a1b 2c3d 4e5f 6g7h 8j9k mnpq ")).toBe(code);
    expect(normalizeRecoveryCode("oAIb2c3d4e5f6g7h8j9kmnpq")).toBe(code); // O for 0, I for 1
    expect(normalizeRecoveryCode("0A1B–2C3D–4E5F–6G7H–8J9K–MNPQ")).toBe(code);
  });

  it("rejects what cannot be a code", () => {
    for (const bad of ["", "0A1B-2C3D", "0A1B-2C3D-4E5F-6G7H-8J9K-MNPQ-RSTV", "UUUU-UUUU-UUUU-UUUU-UUUU-UUUU", "0A1B-2C3D-4E5F-6G7H-8J9K-MNP!"]) expect(normalizeRecoveryCode(bad), bad).toBeNull();
  });
});

describe("recovering the key", () => {
  it("opens the same data key and sets a new passphrase", async () => {
    const { envelope, key } = await createEnvelope(PASS, FAST);
    const sealed = await encryptBytes(key, new TextEncoder().encode("contenu du Vault"), "state");
    const { code, recovery } = await createRecovery(PASS, envelope, FAST);

    const next = await recoverEnvelope(code, recovery, NEXT, FAST);
    const recovered = await openEnvelope(NEXT, next.envelope);
    expect(text(await decryptBytes(recovered, sealed, "state"))).toBe("contenu du Vault");
    await expect(openEnvelope(PASS, next.envelope)).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it("replaces the code once it has been used", async () => {
    const { envelope } = await createEnvelope(PASS, FAST);
    const { code, recovery } = await createRecovery(PASS, envelope, FAST);
    const next = await recoverEnvelope(code, recovery, NEXT, FAST);
    expect(next.code).not.toBe(code);
    await expect(recoverEnvelope(code, next.recovery, "encore une autre phrase", FAST)).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(recoverEnvelope(next.code, next.recovery, "encore une autre phrase", FAST)).resolves.toBeTruthy();
  });

  it("refuses a wrong code, a malformed one, and a wrong passphrase when creating it", async () => {
    const { envelope } = await createEnvelope(PASS, FAST);
    const { code, recovery } = await createRecovery(PASS, envelope, FAST);
    const other = code[0] === "0" ? `1${code.slice(1)}` : `0${code.slice(1)}`;
    await expect(recoverEnvelope(other, recovery, NEXT, FAST)).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(recoverEnvelope("pas un code", recovery, NEXT, FAST)).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(createRecovery("mauvaise phrase", envelope, FAST)).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it("never leaves the code or the key in what is stored", async () => {
    const { envelope } = await createEnvelope(PASS, FAST);
    const { code, recovery } = await createRecovery(PASS, envelope, FAST);
    const stored = JSON.stringify(recovery);
    expect(stored).not.toContain(code);
    expect(stored).not.toContain(code.replace(/-/g, ""));
    expect(recovery.salt).not.toBe(envelope.salt);
    expect(recovery.wrapped).not.toBe(envelope.wrapped);
  });
});

describe("a vault with a recovery code", () => {
  const state = (): Persisted => ({ schema: db.SCHEMA, files: [{ id: "f-1", name: "Contrat", ext: "pdf" } as Persisted["files"][number]], folders: [{ id: "root", name: "NDF SAGA", parentId: null }], projects: [], activity: [], watermark: true, personalMark: true, profile: db.DEFAULT_PROFILE });
  const reopen = () => db.resetForTests();
  let code: string;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    db.resetForTests();
    await db.saveState(state());
    await db.putBlob("f-1", new Blob(["%PDF original"], { type: "application/pdf" }));
    expect(await db.enableProtection(PASS, FAST)).toBe(true);
    code = (await db.createRecoveryCode(PASS, FAST))!;
  });

  it("is created only with the right passphrase, and only for a protected vault", async () => {
    expect(code).toMatch(/^([0-9A-Z]{4}-){5}[0-9A-Z]{4}$/);
    expect(await db.createRecoveryCode("mauvaise phrase", FAST)).toBeNull();
    expect((await db.readMeta()).recoveryAt).toBeTruthy();
    expect(JSON.stringify(await db.readMeta())).not.toContain(code);
    await db.disableProtection(PASS);
    expect(await db.createRecoveryCode(PASS, FAST)).toBeNull();
    expect((await db.readMeta()).recovery).toBeUndefined();
  });

  it("gets a forgotten vault back: new passphrase, same content", async () => {
    reopen();
    expect((await db.unlock("je ne sais plus")).ok).toBe(false);
    const result = await db.recoverWithCode(code, NEXT, FAST);
    expect(result.ok).toBe(true);
    // Recovering does not open the vault by itself.
    expect(db.isUnlocked()).toBe(false);
    expect((await db.unlock(PASS)).ok).toBe(false);
    const opened = await db.unlock(NEXT);
    // The unlock reports the recovery and the failed attempts before it, once.
    expect(opened).toMatchObject({ ok: true, recovered: true, failedBefore: 2 });
    expect(await (await db.getBlob("f-1"))!.text()).toBe("%PDF original");
    expect((await db.loadState()).status).toBe("ok");
    reopen();
    expect(await db.unlock(NEXT)).toMatchObject({ ok: true, recovered: false, failedBefore: 0 });
  });

  it("spends the code: the old one stops working, the new one works", async () => {
    reopen();
    const first = await db.recoverWithCode(code, NEXT, FAST);
    if (!first.ok) throw new Error("recovery failed");
    expect(first.code).not.toBe(code);
    expect((await db.recoverWithCode(code, "troisième phrase secrète", FAST)).ok).toBe(false);
    expect((await db.recoverWithCode(first.code, "troisième phrase secrète", FAST)).ok).toBe(true);
    expect((await db.unlock("troisième phrase secrète")).ok).toBe(true);
  });

  it("counts wrong codes like wrong passphrases", async () => {
    reopen();
    expect(await db.recoverWithCode("0000-0000-0000-0000-0000-0000", NEXT, FAST)).toEqual({ ok: false, failed: 1 });
    expect(await db.recoverWithCode("n'importe quoi", NEXT, FAST)).toEqual({ ok: false, failed: 2 });
    const meta = await db.readMeta();
    expect(meta.failed).toBe(2);
    expect(meta.lastFailedAt).toBeTruthy();
    // The vault is untouched: the real passphrase still opens it.
    expect((await db.unlock(PASS)).ok).toBe(true);
  });

  it("survives a change of passphrase, and is replaced by a new one on request", async () => {
    expect(await db.changePassphrase(PASS, NEXT, FAST)).toBe(true);
    const second = (await db.createRecoveryCode(NEXT, FAST))!;
    expect(second).not.toBe(code);
    reopen();
    // The first code was replaced: only the latest one is valid.
    expect((await db.recoverWithCode(code, "phrase après récupération", FAST)).ok).toBe(false);
    expect((await db.recoverWithCode(second, "phrase après récupération", FAST)).ok).toBe(true);
  });

  it("moves a vault protected by an earlier version to the current key derivation at its next unlock", async () => {
    await db.disableProtection(PASS);
    await db.enableProtection(PASS, { kind: "pbkdf2", iterations: 600_000 });
    expect((await db.readMeta()).envelope).toMatchObject({ v: 1, iterations: 600_000 });
    reopen();
    expect((await db.unlock("mauvaise phrase")).ok).toBe(false);
    expect((await db.readMeta()).envelope!.v).toBe(1);
    expect((await db.unlock(PASS)).ok).toBe(true);
    // Same passphrase, same content, stronger wrapping.
    expect((await db.readMeta()).envelope).toMatchObject({ v: 2, scrypt: { n: 65536, r: 8, p: 2 } });
    expect(await (await db.getBlob("f-1"))!.text()).toBe("%PDF original");
    reopen();
    expect((await db.unlock(PASS)).ok).toBe(true);
    expect((await db.unlock("mauvaise phrase")).ok).toBe(false);
  }, 20_000);

  it("cannot recover a vault that never had a code", async () => {
    await db.disableProtection(PASS);
    await db.enableProtection(PASS, FAST);
    reopen();
    expect((await db.recoverWithCode(code, NEXT, FAST)).ok).toBe(false);
    expect((await db.unlock(PASS)).ok).toBe(true);
  });
});
