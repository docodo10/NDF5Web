import { describe, expect, it } from "vitest";
import { validateState } from "@/lib/backup";
import { DEFAULT_PROFILE, SCHEMA } from "@/lib/db";
import { dueOf, parseDay, today } from "@/lib/due";
import { buildNotices, type NoticeInput } from "@/lib/notices";
import { FILES, FOLDERS, PROJECTS } from "@/lib/sample-data";
import type { VaultFile } from "@/lib/types";
import { MAX_FOLDER_FILES, pickedFromZip } from "@/lib/uploads";
import { ZipError } from "@/lib/unzip";
import { zipBuffer } from "../fixtures/office";

const NOW = new Date(2026, 10, 21, 15, 30); // 21 November 2026, in the afternoon

describe("calendar dates", () => {
  it("accepts real dates only", () => {
    expect(parseDay("2026-12-01")).toBe("2026-12-01");
    expect(parseDay("2028-02-29")).toBe("2028-02-29");
    for (const bad of ["2026-02-31", "2026-13-01", "2026-1-1", "01/12/2026", "demain", "", null, 20261201, "1999-12-31", "2101-01-01", "2026-12-01T00:00"]) expect(parseDay(bad), String(bad)).toBeNull();
  });

  it("names today in local time, whatever the hour", () => {
    expect(today(new Date(2026, 10, 21, 0, 5))).toBe("2026-11-21");
    expect(today(new Date(2026, 10, 21, 23, 55))).toBe("2026-11-21");
  });
});

describe("how far a date is", () => {
  it("counts whole days from today, in words", () => {
    expect(dueOf("2026-11-21", NOW)).toEqual({ days: 0, state: "today", label: "Aujourd’hui" });
    expect(dueOf("2026-11-22", NOW)).toEqual({ days: 1, state: "soon", label: "Demain" });
    expect(dueOf("2026-12-03", NOW)).toEqual({ days: 12, state: "soon", label: "Dans 12 jours" });
    expect(dueOf("2026-12-21", NOW)).toMatchObject({ days: 30, state: "soon" });
    expect(dueOf("2026-12-22", NOW)).toMatchObject({ days: 31, state: "later" });
    expect(dueOf("2026-11-20", NOW)).toEqual({ days: -1, state: "overdue", label: "Échue depuis hier" });
    expect(dueOf("2026-11-01", NOW)).toEqual({ days: -20, state: "overdue", label: "Échue depuis 20 jours" });
  });

  it("is not thrown off by a change of clocks or of year", () => {
    // Daylight saving ended on 1 November 2026 in Montreal: that day has 25 hours.
    expect(dueOf("2026-11-02", new Date(2026, 9, 31, 12))).toMatchObject({ days: 2 });
    expect(dueOf("2027-01-02", new Date(2026, 11, 30, 23, 59))).toMatchObject({ days: 3 });
  });

  it("has nothing to say without a valid date", () => {
    expect(dueOf(undefined, NOW)).toBeNull();
    expect(dueOf("bientôt", NOW)).toBeNull();
  });
});

describe("notices", () => {
  const file = (id: string, extra: Partial<VaultFile> = {}): VaultFile => ({ ...FILES[0], id, name: `Fichier ${id}`, ext: "pdf", sample: false, deleted: false, archived: false, ...extra });
  const base = (files: VaultFile[], extra: Partial<NoticeInput> = {}): NoticeInput => ({ files, protected: true, canProtect: true, hasRecoveryCode: true, lastBackupAt: new Date(NOW.getTime() - 86_400_000).toISOString(), binDays: 30, now: NOW, ...extra });

  it("says nothing when everything is in order", () => {
    expect(buildNotices(base([file("a"), file("b", { dueAt: "2027-06-01" })]))).toEqual([]);
    // A vault that only holds the sample files has nothing to protect or back up.
    expect(buildNotices(base(FILES, { protected: false, hasRecoveryCode: false, lastBackupAt: null }))).toEqual([]);
  });

  it("lists dates that are past or close, the most pressing first, and skips files that are gone", () => {
    const notices = buildNotices(base([file("soon", { dueAt: "2026-12-01", dueLabel: "Expiration de l’option" }), file("late", { dueAt: "2026-11-10" }), file("today", { dueAt: "2026-11-21" }), file("far", { dueAt: "2027-03-01" }), file("binned", { dueAt: "2026-11-01", deleted: true }), file("shelved", { dueAt: "2026-11-01", archived: true })]));
    expect(notices.map((n) => [n.id, n.tone, n.detail])).toEqual([
      ["due-late", "alert", "Échue depuis 11 jours"],
      ["due-today", "alert", "Échéance : aujourd’hui"],
      ["due-soon", "warn", "Échéance : dans 10 jours"],
    ]);
    expect(notices[2].title).toBe("Expiration de l’option — Fichier soon.pdf");
    expect(notices[0].action).toEqual({ kind: "file", fileId: "late" });
  });

  it("points out what is missing to protect uploaded files", () => {
    const ids = (input: NoticeInput) => buildNotices(input).map((n) => n.id);
    expect(ids(base([file("a")], { protected: false, hasRecoveryCode: false, lastBackupAt: null }))).toEqual(["protect", "backup"]);
    expect(ids(base([file("a")], { hasRecoveryCode: false }))).toEqual(["recovery"]);
    expect(ids(base([file("a")], { lastBackupAt: new Date(NOW.getTime() - 45 * 86_400_000).toISOString() }))).toEqual(["backup"]);
    // No encryption available in this browser: nothing useful to suggest.
    expect(ids(base([file("a")], { protected: false, canProtect: false }))).toEqual([]);
  });

  it("warns before deleted files leave the bin for good", () => {
    const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
    const notices = buildNotices(base([file("a", { deleted: true, deletedAt: ago(28) }), file("b", { deleted: true, deletedAt: ago(29) }), file("c", { deleted: true, deletedAt: ago(5) })]));
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ id: "bin", title: "2 fichiers vont quitter la corbeille", action: { kind: "bin" } });
  });
});

describe("dates and comments in a restored state", () => {
  it("keeps what is valid and drops the rest", () => {
    const files = [
      { ...FILES[0], id: "f-a", dueAt: "2026-12-01", dueLabel: "Expiration‮ de l’option", comments: [{ id: "c-1", at: "2026-11-20T10:00:00", author: "Admin NDF5", text: "À renouveler <b>avant</b> décembre." }, { id: "c-2", at: "2026-11-20T10:05:00", author: "x", text: "   " }, { id: "../c", at: "x", author: "x", text: "x" }, "pas un commentaire"] },
      { ...FILES[0], id: "f-b", dueAt: "2026-02-31", dueLabel: "Date impossible" },
      { ...FILES[0], id: "f-c", dueLabel: "Sans date" },
    ];
    const clean = validateState({ schema: SCHEMA, files, folders: FOLDERS, projects: PROJECTS, activity: [], watermark: true, personalMark: true, profile: DEFAULT_PROFILE })!;
    expect(clean.files[0]).toMatchObject({ dueAt: "2026-12-01", dueLabel: "Expiration de l’option" });
    // Text stays text: it is shown as written, never interpreted.
    expect(clean.files[0].comments).toEqual([{ id: "c-1", at: "2026-11-20T10:00:00", author: "Admin NDF5", text: "À renouveler <b>avant</b> décembre." }]);
    expect(clean.files[1].dueAt).toBeUndefined();
    expect(clean.files[1].dueLabel).toBeUndefined();
    expect(clean.files[2].dueLabel).toBeUndefined();
  });
});

describe("importing an archive", () => {
  const blob = (b: Buffer) => new Blob([new Uint8Array(b)]);

  it("unpacks files with the folders they were in, and leaves out what archiving tools add", async () => {
    const archive = zipBuffer([
      { name: "Contrats/", data: "" },
      { name: "Contrats/Entente.txt", data: "texte de l’entente" },
      { name: "Contrats/Annexes/Annexe A.txt", data: "annexe" },
      { name: "__MACOSX/Contrats/._Entente.txt", data: "bruit" },
      { name: "Contrats/.DS_Store", data: "bruit" },
      { name: "Seul.txt", data: "à la racine", stored: true },
    ]);
    const { picked, skipped } = await pickedFromZip(blob(archive));
    expect(skipped).toBe(0);
    expect(picked.map((p) => [...p.path, p.file.name].join("/"))).toEqual(["Contrats/Entente.txt", "Contrats/Annexes/Annexe A.txt", "Seul.txt"]);
    expect(await picked[0].file.text()).toBe("texte de l’entente");
  });

  it("cannot be used to write outside the destination", async () => {
    const { picked } = await pickedFromZip(blob(zipBuffer([{ name: "../../etc/passwd.txt", data: "x" }, { name: "/absolu/chemin.txt", data: "x" }, { name: "a/../../b/c.txt", data: "x" }])));
    expect(picked.map((p) => p.path)).toEqual([["etc"], ["absolu"], ["a", "b"]]);
  });

  it("skips entries that are too large or damaged, and counts them", async () => {
    const good = zipBuffer([{ name: "ok.txt", data: "bon" }, { name: "abîmé.txt", data: "contenu original", stored: true }]);
    good.write("modifiée", good.indexOf("original"), "latin1");
    const { picked, skipped } = await pickedFromZip(blob(good));
    expect(picked.map((p) => p.file.name)).toEqual(["ok.txt"]);
    expect(skipped).toBe(1);
  });

  it("stops at a limit of files, and refuses what is not an archive", async () => {
    const many = zipBuffer(Array.from({ length: MAX_FOLDER_FILES + 30 }, (_, i) => ({ name: `f${i}.txt`, data: "x", stored: true })));
    const { picked, skipped } = await pickedFromZip(blob(many));
    expect(picked).toHaveLength(MAX_FOLDER_FILES);
    expect(skipped).toBe(30);
    await expect(pickedFromZip(new Blob(["pas une archive"]))).rejects.toBeInstanceOf(ZipError);
  });
});
