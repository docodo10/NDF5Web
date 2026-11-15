import { describe, expect, it } from "vitest";
import { validateState } from "@/lib/backup";
import { SCHEMA, DEFAULT_PROFILE } from "@/lib/db";
import { droppedFileIds, isFileDrag, startFileDrag } from "@/lib/dnd";
import { FILES, FOLDERS, PROJECTS } from "@/lib/sample-data";
import { folderSegments, MAX_FOLDER_FILES, pickedFromDrop, pickedFromInput } from "@/lib/uploads";

/** A stand-in for the browser's drag payload. */
function transfer(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    dataTransfer: {
      effectAllowed: "none",
      get types() {
        return [...data.keys()];
      },
      setData: (type: string, value: string) => void data.set(type, value),
      getData: (type: string) => data.get(type) ?? "",
    } as unknown as DataTransfer,
  };
}

describe("dragging files of the vault", () => {
  it("carries the ids of the files, and is told apart from files of the computer", () => {
    const e = transfer();
    startFileDrag(e, ["f-abc", "f-def"]);
    expect(isFileDrag(e)).toBe(true);
    expect(droppedFileIds(e)).toEqual(["f-abc", "f-def"]);
    expect(e.dataTransfer.effectAllowed).toBe("move");
    expect(isFileDrag(transfer({ Files: "" }))).toBe(false);
    expect(isFileDrag(transfer({ "text/plain": "bonjour" }))).toBe(false);
  });

  it("ignores a payload that is not a clean list of ids", () => {
    const type = "application/x-ndf-vault-files";
    expect(droppedFileIds(transfer({ [type]: "pas du json" }))).toEqual([]);
    expect(droppedFileIds(transfer({ [type]: '{"id":"f-1"}' }))).toEqual([]);
    expect(droppedFileIds(transfer({ [type]: JSON.stringify(["f-ok", 7, null, "../../etc", "<script>", "f-2"]) }))).toEqual(["f-ok", "f-2"]);
    expect(droppedFileIds(transfer({ [type]: JSON.stringify(Array.from({ length: 900 }, (_, i) => `f-${i}`)) }))).toHaveLength(500);
    expect(droppedFileIds(transfer())).toEqual([]);
  });
});

describe("files that come inside folders", () => {
  it("turns a relative path into clean folder names", () => {
    expect(folderSegments("Contrats/2026/Entente.pdf")).toEqual(["Contrats", "2026"]);
    expect(folderSegments("Entente.pdf")).toEqual([]);
    expect(folderSegments("")).toEqual([]);
    expect(folderSegments("a\\b\\c.txt")).toEqual(["a", "b"]);
    // Nothing that climbs out, hides, or carries control characters.
    expect(folderSegments("../../etc/passwd")).toEqual(["etc"]);
    expect(folderSegments("./x/.cache/rapport‮fdp/z.txt")).toEqual(["x", "cache", "rapportfdp"]);
    expect(folderSegments(`${"d/".repeat(40)}f.txt`)).toHaveLength(12);
  });

  it("keeps each file's place when a folder is chosen, and leaves system clutter out", () => {
    const file = (name: string, path: string) => Object.defineProperty(new File(["x"], name), "webkitRelativePath", { value: path });
    const picked = pickedFromInput([file("Entente.pdf", "Contrats/Entente.pdf"), file("Annexe.pdf", "Contrats/Annexes/Annexe.pdf"), file(".DS_Store", "Contrats/.DS_Store"), file("Thumbs.db", "Contrats/Thumbs.db"), file("~$Entente.docx", "Contrats/~$Entente.docx"), file("Seul.txt", "")]);
    expect(picked.map((p) => [p.file.name, p.path])).toEqual([
      ["Entente.pdf", ["Contrats"]],
      ["Annexe.pdf", ["Contrats", "Annexes"]],
      ["Seul.txt", []],
    ]);
    expect(pickedFromInput(null)).toEqual([]);
  });

  it("walks a dropped folder through to its files", async () => {
    const leaf = (name: string) => ({ isFile: true, isDirectory: false, name, file: (ok: (f: File) => void) => ok(new File(["x"], name)) });
    // A folder is read in batches: the reader answers twice, then with nothing.
    const dir = (name: string, children: unknown[]) => ({
      isFile: false,
      isDirectory: true,
      name,
      createReader: () => {
        const batches = [children.slice(0, 1), children.slice(1), []];
        return { readEntries: (ok: (e: unknown[]) => void) => ok(batches.shift() ?? []) };
      },
    });
    const tree = dir("Projet", [leaf("a.txt"), dir("Sous-dossier", [leaf("b.txt"), leaf(".DS_Store")]), dir(".git", [leaf("config")]), leaf("c.txt")]);
    const data = { items: [{ kind: "file", webkitGetAsEntry: () => tree }, { kind: "file", webkitGetAsEntry: () => leaf("seul.txt") }, { kind: "string", webkitGetAsEntry: () => null }], files: [] } as unknown as DataTransfer;
    const picked = await pickedFromDrop(data);
    expect(picked.map((p) => `${[...p.path, p.file.name].join("/")}`)).toEqual(["Projet/a.txt", "Projet/Sous-dossier/b.txt", "Projet/c.txt", "seul.txt"]);
  });

  it("stops at a limit on a folder with too many files, and falls back to plain files without folder support", async () => {
    const many = { isFile: false, isDirectory: true, name: "Gros", createReader: () => {
      let sent = false;
      return { readEntries: (ok: (e: unknown[]) => void) => { ok(sent ? [] : Array.from({ length: MAX_FOLDER_FILES + 200 }, (_, i) => ({ isFile: true, isDirectory: false, name: `f${i}.txt`, file: (done: (f: File) => void) => done(new File(["x"], `f${i}.txt`)) }))); sent = true; } };
    } };
    const picked = await pickedFromDrop({ items: [{ kind: "file", webkitGetAsEntry: () => many }], files: [] } as unknown as DataTransfer);
    expect(picked).toHaveLength(MAX_FOLDER_FILES);
    const plain = await pickedFromDrop({ items: [], files: [new File(["x"], "a.txt")] } as unknown as DataTransfer);
    expect(plain.map((p) => p.file.name)).toEqual(["a.txt"]);
    expect(await pickedFromDrop(null)).toEqual([]);
  });
});

describe("the bin in a restored state", () => {
  it("keeps the date a file was deleted, and only for deleted files", () => {
    const state = { schema: SCHEMA, files: [{ ...FILES[0], id: "f-a", deleted: true, deletedAt: "2026-11-01T10:00:00.000Z" }, { ...FILES[0], id: "f-b", deleted: false, deletedAt: "2026-11-01T10:00:00.000Z" }, { ...FILES[0], id: "f-c", deleted: true, deletedAt: 42 }], folders: FOLDERS, projects: PROJECTS, activity: [], watermark: true, personalMark: true, profile: DEFAULT_PROFILE };
    expect(validateState(state)!.files.map((f) => f.deletedAt)).toEqual(["2026-11-01T10:00:00.000Z", undefined, undefined]);
  });
});
