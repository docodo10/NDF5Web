import { describe, expect, it } from "vitest";
import { hashToRoute, routeToHash } from "@/lib/routes";
import { FILES, FOLDERS, PROJECTS } from "@/lib/sample-data";
import { fileCategory, folderRules } from "@/lib/selectors";
import { watermarkText, winAnsiSafe } from "@/lib/stamp";
import type { Folder, VaultFile } from "@/lib/types";

const folder = (id: string) => FOLDERS.find((f) => f.id === id)!;
const rules = (f: Folder, folders = FOLDERS, files: VaultFile[] = FILES) => folderRules(f, folders, files, PROJECTS);

describe("folder rules", () => {
  it("locks the root entirely", () => {
    const r = rules(folder("root"));
    expect(r.renamable).toBe(false);
    expect(r.moveBlocked).toBeTruthy();
    expect(r.deleteBlocked).toBeTruthy();
  });

  it("keeps the numbered index in place but lets it be renamed", () => {
    const r = rules(folder("legal"));
    expect(r.renamable).toBe(true);
    expect(r.moveBlocked).toMatch(/restent à leur place/);
    expect(r.deleteBlocked).toMatch(/ne peuvent pas être supprimés/);
  });

  it("protects a project's folder from deletion", () => {
    expect(rules(folder("pb1")).deleteBlocked).toMatch(/projet PB1/);
  });

  it("allows deleting an empty folder and nothing else", () => {
    const empty: Folder = { id: "x", name: "Vide", parentId: "legal" };
    expect(rules(empty, [...FOLDERS, empty])).toEqual({ renamable: true, moveBlocked: null, deleteBlocked: null });

    const child: Folder = { id: "y", name: "Sous-dossier", parentId: "x" };
    expect(rules(empty, [...FOLDERS, empty, child]).deleteBlocked).toMatch(/1 sous-dossier/);

    // A file that was archived or sent to Deleted still lives there and would be lost.
    const hidden = { ...FILES[0], id: "h", folderId: "x", deleted: true };
    expect(rules(empty, [...FOLDERS, empty], [...FILES, hidden]).deleteBlocked).toMatch(/1 fichier/);
    const deep = { ...FILES[0], id: "d", folderId: "y", archived: true };
    expect(rules(empty, [...FOLDERS, empty, child], [...FILES, hidden, deep]).deleteBlocked).toMatch(/2 fichiers et 1 sous-dossier/);
  });
});

describe("project sections", () => {
  const where = (folderId: string) => fileCategory({ ...FILES[0], folderId }, FOLDERS, PROJECTS);
  it("derives a file's section from where it is filed", () => {
    expect(where("business")).toBe("financial");
    expect(where("legal")).toBe("legal");
    expect(where("signed")).toBe("legal");
    expect(where("screenplays")).toBe("production");
    expect(where("fs1")).toBe("production"); // nested under 04 Production
    expect(where("overview")).toBe("other");
    expect(where("root")).toBe("other");
  });
});

describe("routes", () => {
  it("round-trips every kind of route through a plain hash", () => {
    for (const route of [{ view: "home" }, { view: "files" }, { view: "preferences" }, { view: "project", id: "pb1" }, { view: "folder", id: "d-abc123" }] as const) {
      const hash = routeToHash(route);
      expect(hash).toMatch(/^#[a-z0-9-]+$/);
      expect(hashToRoute(hash)).toEqual(route);
    }
  });

  it("falls back to home for anything it does not know", () => {
    for (const hash of ["", "#", "#nope", "#/files", "#files?x=1", "#<script>", "#settings"]) expect(hashToRoute(hash)).toEqual({ view: "home" });
  });
});

describe("watermark text", () => {
  const at = new Date(2026, 10, 14, 15, 4);
  it("names the person, the time and the confidentiality", () => {
    expect(watermarkText({ name: "Alex Martin", company: "NDF5 Productions", email: "alex@example.com" }, at)).toBe("Alex Martin · NDF5 Productions · alex@example.com · 14 nov. 2026, 15 h 04 · Confidentiel – NDF5");
  });

  it("skips what the profile leaves empty", () => {
    expect(watermarkText({ name: "Admin NDF5", company: "", email: " " }, at)).toBe("Admin NDF5 · 14 nov. 2026, 15 h 04 · Confidentiel – NDF5");
  });

  it("only sends characters the PDF fonts can draw", () => {
    expect(winAnsiSafe("Élodie – « café » · Confidentiel")).toBe("Élodie – « café » · Confidentiel");
    expect(winAnsiSafe("名前 ✓ ok")).toBe("?? ? ok");
  });
});
