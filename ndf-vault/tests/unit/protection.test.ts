import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { validateState } from "@/lib/backup";
import * as db from "@/lib/db";
import type { Persisted } from "@/lib/db";
import { bakeWatermark, consultationCode, highest, lowers, normalizeConsultationCode, PROTECTION_HINT, PROTECTION_LABEL, PROTECTION_LEVELS, protectionOf, type Brush } from "@/lib/protection";
import { FILES, FOLDERS, PROJECTS } from "@/lib/sample-data";

describe("protection levels", () => {
  it("defaults to standard and reads the level a file carries", () => {
    expect(protectionOf(undefined)).toBe("standard");
    expect(protectionOf({})).toBe("standard");
    expect(protectionOf({ protection: "view" })).toBe("view");
    expect(protectionOf({ protection: "high" })).toBe("high");
  });

  it("knows which changes take protection away", () => {
    expect(lowers("high", "view")).toBe(true);
    expect(lowers("high", "standard")).toBe(true);
    expect(lowers("view", "standard")).toBe(true);
    expect(lowers("standard", "high")).toBe(false);
    expect(lowers("view", "high")).toBe(false);
    expect(lowers("view", "view")).toBe(false);
  });

  it("takes the strictest level of a group", () => {
    expect(highest([])).toBe("standard");
    expect(highest(["standard", "view", "standard"])).toBe("view");
    expect(highest(["view", "high", "standard"])).toBe("high");
  });

  it("describes every level, without promising what no screen can deliver", () => {
    for (const level of PROTECTION_LEVELS) {
      expect(PROTECTION_LABEL[level]).toBeTruthy();
      expect(PROTECTION_HINT[level]).toBeTruthy();
      expect(`${PROTECTION_LABEL[level]} ${PROTECTION_HINT[level]}`).not.toMatch(/impossible|inviolable|100 ?%|garanti/i);
    }
  });
});

describe("consultation code", () => {
  it("is short, unambiguous, and different at every opening", () => {
    const codes = Array.from({ length: 500 }, consultationCode);
    for (const c of codes) expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{3}-[0-9A-HJKMNP-TV-Z]{3}$/);
    // A billion possible codes: 500 draws do not collide.
    expect(new Set(codes).size).toBe(500);
  });

  it("is recognized however it is typed back from a photo", () => {
    expect(normalizeConsultationCode("K7Q-2M9")).toBe("K7Q-2M9");
    expect(normalizeConsultationCode(" k7q 2m9 ")).toBe("K7Q-2M9");
    expect(normalizeConsultationCode("k7q2m9")).toBe("K7Q-2M9");
    expect(normalizeConsultationCode("KOQ-IL9")).toBe("K0Q-119");
    for (const bad of ["", "K7Q", "K7Q-2M9-X", "K7Q-2M!", "décors", "UUU-UUU"]) expect(normalizeConsultationCode(bad), bad).toBeNull();
  });
});

describe("watermark drawn into the page", () => {
  const brush = () => {
    const calls: { text: string; x: number; y: number }[] = [];
    const log: string[] = [];
    const ctx: Brush = {
      save: () => log.push("save"),
      restore: () => log.push("restore"),
      translate: () => log.push("translate"),
      rotate: (a) => log.push(`rotate ${a.toFixed(2)}`),
      fillText: (text, x, y) => calls.push({ text, x, y }),
      globalAlpha: 1,
      fillStyle: "",
      font: "",
      textAlign: "start",
      textBaseline: "alphabetic",
    };
    return { ctx, calls, log };
  };

  it("covers the whole page with the text, at an angle, faint enough to read through", () => {
    const { ctx, calls, log } = brush();
    bakeWatermark(ctx, 1600, 2200, "Admin NDF5 · K7Q-2M9");
    expect(calls.length).toBeGreaterThanOrEqual(8);
    for (const c of calls) expect(c.text).toContain("Admin NDF5 · K7Q-2M9");
    // The lines reach past both ends of the page's diagonal, so no corner is left clean.
    const ys = calls.map((c) => c.y);
    expect(Math.min(...ys)).toBeLessThan(-1000);
    expect(Math.max(...ys)).toBeGreaterThan(1000);
    expect(ctx.globalAlpha).toBeGreaterThan(0.08);
    expect(ctx.globalAlpha).toBeLessThan(0.25);
    expect(log[0]).toBe("save");
    expect(log).toContain("rotate -0.49");
    expect(log[log.length - 1]).toBe("restore");
  });

  it("scales its text with the page and stays legible on a small one", () => {
    const big = brush();
    bakeWatermark(big.ctx, 3200, 4000, "x");
    const small = brush();
    bakeWatermark(small.ctx, 200, 260, "x");
    const size = (font: string) => Number(/(\d+)px/.exec(font)![1]);
    expect(size(big.ctx.font)).toBeGreaterThan(size(small.ctx.font));
    expect(size(small.ctx.font)).toBeGreaterThanOrEqual(9);
    expect(small.calls.length).toBeGreaterThanOrEqual(5);
  });
});

describe("erasing the vault after too many wrong attempts", () => {
  const FAST = 1000;
  const PASS = "tortue lampe orage fenêtre";
  const state = (): Persisted => ({ schema: db.SCHEMA, files: [{ id: "f-1", name: "Contrat", ext: "pdf" } as Persisted["files"][number]], folders: [{ id: "root", name: "NDF SAGA", parentId: null }], projects: [], activity: [], watermark: true, personalMark: true, profile: db.DEFAULT_PROFILE });

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    db.resetForTests();
    await db.saveState(state());
    await db.putBlob("f-1", new Blob(["%PDF original"]));
    await db.enableProtection(PASS, FAST);
  });

  it("is off unless asked for: wrong attempts only count", async () => {
    db.resetForTests();
    for (let i = 1; i <= 12; i++) expect(await db.unlock("mauvaise phrase")).toEqual({ ok: false, failed: i });
    expect((await db.unlock(PASS)).ok).toBe(true);
    expect(await (await db.getBlob("f-1"))!.text()).toBe("%PDF original");
  });

  it("erases everything at the limit, and not one attempt before", async () => {
    await db.setWipeAfter(4);
    db.resetForTests();
    for (let i = 1; i <= 3; i++) expect(await db.unlock("mauvaise phrase")).toEqual({ ok: false, failed: i });
    expect((await db.readMeta()).protected).toBe(true);
    expect(await db.unlock("mauvaise phrase")).toEqual({ ok: false, failed: 4, wiped: true });
    // Nothing is left: no protection, no state, no original, and the right passphrase opens nothing.
    const meta = await db.readMeta();
    expect(meta.protected).toBe(false);
    expect(meta.envelope).toBeUndefined();
    expect(await db.loadState()).toEqual({ status: "empty" });
    expect(await db.listBlobIds()).toEqual([]);
  });

  it("starts the count again after a successful unlock", async () => {
    await db.setWipeAfter(3);
    db.resetForTests();
    await db.unlock("mauvaise phrase");
    await db.unlock("mauvaise phrase");
    expect((await db.unlock(PASS)).ok).toBe(true);
    db.resetForTests();
    expect(await db.unlock("mauvaise phrase")).toEqual({ ok: false, failed: 1 });
    expect((await db.unlock(PASS)).ok).toBe(true);
  });

  it("counts wrong recovery codes toward the limit too", async () => {
    await db.createRecoveryCode(PASS, FAST);
    await db.setWipeAfter(3);
    db.resetForTests();
    await db.unlock("mauvaise phrase");
    await db.recoverWithCode("0000-0000-0000-0000-0000-0000", "nouvelle phrase secrète", FAST);
    expect(await db.recoverWithCode("pas un code", "nouvelle phrase secrète", FAST)).toEqual({ ok: false, failed: 3, wiped: true });
    expect((await db.readMeta()).protected).toBe(false);
  });

  it("never accepts a limit low enough to be hit by accident, and can be turned off", async () => {
    await db.setWipeAfter(1);
    expect((await db.readMeta()).wipeAfter).toBe(3);
    await db.setWipeAfter(0);
    expect((await db.readMeta()).wipeAfter).toBeUndefined();
    await db.setWipeAfter(db.WIPE_AFTER);
    expect((await db.readMeta()).wipeAfter).toBe(10);
    // Turning protection off forgets the option with the rest.
    await db.disableProtection(PASS);
    expect((await db.readMeta()).wipeAfter).toBeUndefined();
  });
});

describe("protection in saved and restored states", () => {
  const base = (): Record<string, unknown> => ({
    schema: db.SCHEMA,
    files: [
      { ...FILES[0], id: "f-a", sample: false, protection: "high" },
      { ...FILES[0], id: "f-b", sample: false, protection: "view" },
      { ...FILES[0], id: "f-c", sample: false, protection: "ultra" },
      { ...FILES[0], id: "f-d", sample: false },
    ],
    folders: FOLDERS,
    projects: PROJECTS,
    activity: [
      { id: "a-1", at: "2026-11-14T15:04:00", userId: "u-admin", verb: "a ouvert", target: "Contrat.pdf", projectId: null, code: "K7Q-2M9" },
      { id: "a-2", at: "2026-11-14T15:05:00", userId: "u-admin", verb: "a ouvert", target: "Contrat.pdf", projectId: null, code: "<script>" },
    ],
    watermark: true,
    personalMark: true,
    profile: db.DEFAULT_PROFILE,
    defaultProtection: "view",
  });

  it("keeps valid levels and codes, and drops anything else", () => {
    const clean = validateState(base())!;
    expect(clean.files.map((f) => f.protection)).toEqual(["high", "view", undefined, undefined]);
    expect(clean.activity.map((a) => a.code)).toEqual(["K7Q-2M9", undefined]);
    expect(clean.defaultProtection).toBe("view");
    expect(validateState({ ...base(), defaultProtection: "none" })!.defaultProtection).toBeUndefined();
  });

  it("brings the default level and the security dates through a save", () => {
    const saved = db.migrate({ ...(base() as unknown as Persisted), lastBackupAt: "2026-11-14T20:00:00.000Z", lastAuditAt: "2026-11-13T09:00:00.000Z" })!;
    expect(saved).toMatchObject({ defaultProtection: "view", lastBackupAt: "2026-11-14T20:00:00.000Z", lastAuditAt: "2026-11-13T09:00:00.000Z" });
    const plain = db.migrate({ schema: db.SCHEMA, files: [], folders: [] })!;
    expect(plain.defaultProtection).toBeUndefined();
    expect(plain.lastBackupAt).toBeUndefined();
  });
});
