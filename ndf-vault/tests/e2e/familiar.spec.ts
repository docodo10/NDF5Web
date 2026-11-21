import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dialog, go, main, openVault, pngFile, row, textFile, toast, upload } from "./helpers";

type Page = import("@playwright/test").Page;

const tiles = (page: Page) => main(page).locator("[data-file-tile]");
// The folder tree and the storage meter sit in the sidebar, below its navigation links.
const folderInSidebar = (page: Page, id: string) => page.locator(`aside [data-drop-folder="${id}"]`).first();

async function seeded(page: Page) {
  await openVault(page);
  await upload(page, [textFile("Mandat.txt", "contenu du mandat"), textFile("Avenant.txt", "contenu de l’avenant"), pngFile("Croquis.png", 320, 200)], "legal");
}

test.describe("moving files by dragging them", () => {
  test("a file dragged onto a folder of the sidebar moves there, and can be put back", async ({ page }) => {
    await seeded(page);
    await row(page, "Mandat").dragTo(folderInSidebar(page, "business"));
    await expect(toast(page)).toContainText("Mandat.txt déplacé vers Affaires et finances");
    await expect(row(page, "Mandat")).toHaveCount(0);
    await go(page, "folder-business");
    await expect(row(page, "Mandat")).toBeVisible();
    // The same undo as any other move.
    await toast(page).getByRole("button", { name: "Annuler" }).click();
    await expect(row(page, "Mandat")).toHaveCount(0);
    await go(page, "folder-legal");
    await expect(row(page, "Mandat")).toBeVisible();
  });

  test("dragging one file of a selection takes the whole selection", async ({ page }) => {
    await seeded(page);
    await row(page, "Mandat").getByRole("checkbox").click();
    await row(page, "Avenant").getByRole("checkbox").click();
    await row(page, "Avenant").dragTo(folderInSidebar(page, "business"));
    await expect(toast(page)).toContainText("2 fichiers déplacés vers Affaires et finances");
    await expect(row(page, "Croquis")).toBeVisible();
    await go(page, "folder-business");
    await expect(row(page, "Mandat")).toBeVisible();
    await expect(row(page, "Avenant")).toBeVisible();
  });

  test("a file dropped on a subfolder tile goes into it; dropped where it already is, nothing happens", async ({ page }) => {
    await openVault(page);
    await upload(page, [textFile("Plan de travail.txt", "x")], "production");
    const tile = main(page).locator('[data-drop-folder="pb1"]');
    await row(page, "Plan de travail").dragTo(tile);
    await expect(toast(page)).toContainText("Plan de travail.txt déplacé vers");
    await go(page, "folder-pb1");
    await expect(row(page, "Plan de travail")).toBeVisible();
    await page.locator("[data-toast] button").last().click();
    // Onto its own folder: no move, no message.
    await row(page, "Plan de travail").dragTo(folderInSidebar(page, "pb1"));
    await expect(toast(page)).toHaveCount(0);
    await expect(row(page, "Plan de travail")).toBeVisible();
  });
});

test.describe("right click", () => {
  test("opens the file's menu where the pointer is, with the same actions as the button", async ({ page }) => {
    await seeded(page);
    await row(page, "Mandat").click({ button: "right" });
    const menu = page.getByRole("menu", { name: "Actions pour Mandat.txt" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveText(["Ouvrir", "Aperçu", "Informations", "Épingler à l’accueil", "Renommer", "Modifier les détails", "Déplacer", "Copier", "Partager", "Télécharger", "Protection", "Historique des versions", "Archiver", "Supprimer"]);
    // The right click did not open the file.
    await expect(page.locator("[data-viewer-canvas]")).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "Renommer" }).click();
    await page.fill("#file-name", "Mandat signé");
    await dialog(page).locator("button[type=submit]").click();
    await expect(row(page, "Mandat signé")).toBeVisible();
  });
});

test.describe("grid view", () => {
  test("shows files as tiles, remembers the choice, and keeps every action", async ({ page }) => {
    await seeded(page);
    await expect(tiles(page)).toHaveCount(0);
    await main(page).getByRole("button", { name: "Vue en grille" }).click();
    await expect(tiles(page).filter({ hasText: "Mandat" })).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(0);
    // An image that may be shown freely gets a thumbnail; other files get their icon.
    await expect(tiles(page).filter({ hasText: "Croquis" }).locator("img")).toHaveAttribute("src", /^blob:/);
    await expect(tiles(page).filter({ hasText: "Mandat" }).locator("img")).toHaveCount(0);

    // Click opens, right click gives the menu, dragging moves.
    await tiles(page).filter({ hasText: "Mandat" }).getByRole("button", { name: "Ouvrir Mandat.txt" }).click();
    await expect(dialog(page).locator("[data-viewer-canvas]")).toContainText("contenu du mandat");
    await page.keyboard.press("Escape");
    await tiles(page).filter({ hasText: "Avenant" }).click({ button: "right" });
    await expect(page.getByRole("menu", { name: "Actions pour Avenant.txt" })).toBeVisible();
    await page.keyboard.press("Escape");
    await tiles(page).filter({ hasText: "Avenant" }).dragTo(folderInSidebar(page, "business"));
    await expect(toast(page)).toContainText("Avenant.txt déplacé vers Affaires et finances");
    await expect(tiles(page).filter({ hasText: "Avenant" })).toHaveCount(0);

    // Still a grid after a reload, here and in the other file views; the list is one click away.
    await page.reload();
    await expect(tiles(page).filter({ hasText: "Mandat" })).toBeVisible();
    await go(page, "files");
    await expect(tiles(page).first()).toBeVisible();
    await main(page).getByRole("button", { name: "Vue en liste" }).click();
    await expect(tiles(page)).toHaveCount(0);
    await expect(page.locator("tbody tr").first()).toBeVisible();
  });

  test("a protected image has no thumbnail: it only ever appears in the viewer", async ({ page }) => {
    await seeded(page);
    await row(page, "Croquis").getByRole("button", { name: /^Actions pour/ }).click();
    await page.getByRole("menuitem", { name: "Protection", exact: true }).click();
    await dialog(page).getByRole("radio", { name: /^Consultation seule/ }).check();
    await dialog(page).locator("button[type=submit]").click();
    await main(page).getByRole("button", { name: "Vue en grille" }).click();
    const tile = tiles(page).filter({ hasText: "Croquis" });
    await expect(tile).toBeVisible();
    await expect(tile.locator("img")).toHaveCount(0);
    expect(await page.evaluate(() => document.querySelectorAll('[src^="blob:"]').length)).toBe(0);
  });
});

test.describe("uploading a whole folder", () => {
  test("recreates its subfolders and leaves system files out", async ({ page }, testInfo) => {
    const root = testInfo.outputPath("Dossier de test");
    await mkdir(join(root, "Annexes", "Signées"), { recursive: true });
    await writeFile(join(root, "Contrat.txt"), "contrat principal");
    await writeFile(join(root, "Annexes", "Annexe A.txt"), "première annexe");
    await writeFile(join(root, "Annexes", "Signées", "Annexe A signée.txt"), "annexe signée");
    await writeFile(join(root, ".DS_Store"), "bruit");
    await writeFile(join(root, "Annexes", "Thumbs.db"), "bruit");

    await openVault(page, "folder-legal");
    await main(page).getByRole("button", { name: "Téléverser" }).first().click();
    const d = page.getByRole("dialog", { name: "Téléverser des fichiers" });
    await d.locator("#upload-folder-input").setInputFiles(root);
    const list = d.getByRole("list", { name: "Fichiers choisis" });
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await expect(list).toContainText("Dossier de test / Annexes / Signées / Annexe A signée.txt");
    await expect(list).not.toContainText("DS_Store");
    await d.locator("button[type=submit]").click();
    await expect(toast(page)).toContainText("3 fichiers téléversés");

    // The folder arrived under the destination, with its tree, and nothing at the destination itself.
    await expect(row(page, "Contrat.txt")).toHaveCount(0);
    await main(page).getByRole("button", { name: /Dossier de test/ }).click();
    await expect(row(page, "Contrat")).toBeVisible();
    await main(page).getByRole("button", { name: /Annexes/ }).click();
    await expect(row(page, "Annexe A")).toBeVisible();
    await main(page).getByRole("button", { name: /Signées/ }).click();
    await row(page, "Annexe A signée").click();
    await expect(dialog(page).locator("[data-viewer-canvas]")).toContainText("annexe signée");
    await page.keyboard.press("Escape");

    // Sent again, the folder is not duplicated: the files join the folders that exist, numbered.
    await go(page, "folder-legal");
    await main(page).getByRole("button", { name: "Téléverser" }).first().click();
    await d.locator("#upload-folder-input").setInputFiles(root);
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await d.locator("button[type=submit]").click();
    await expect(main(page).getByRole("button", { name: /Dossier de test/ })).toHaveCount(1);
    await main(page).getByRole("button", { name: /Dossier de test/ }).click();
    await expect(row(page, "Contrat (2)")).toBeVisible();
  });
});

test.describe("names", () => {
  test("a second file of the same name in a folder is numbered instead of being confused with the first", async ({ page }) => {
    await openVault(page);
    await upload(page, [textFile("Notes.txt", "première version des notes")], "legal");
    await go(page, "home");
    await upload(page, [textFile("Notes.txt", "d’autres notes, même nom")], "legal");
    await expect(row(page, "Notes (2)")).toBeVisible();
    await go(page, "home");
    await upload(page, [textFile("Notes.txt", "troisième fichier")], "legal");
    await expect(row(page, "Notes (3)")).toBeVisible();
    // The same name elsewhere is nobody's twin.
    await go(page, "home");
    await upload(page, [textFile("Notes.txt", "dans un autre dossier")], "business");
    await expect(row(page, "Notes (2)")).toHaveCount(0);
    await expect(main(page).locator("tbody tr", { hasText: "Notes" })).toHaveCount(1);
  });
});

test.describe("the bin", () => {
  const bin = async (page: Page) => {
    await go(page, "archived");
    await main(page).getByRole("tab", { name: /Supprimés/ }).click();
  };

  test("keeps deleted files for thirty days, says so, and can be emptied", async ({ page }) => {
    await seeded(page);
    for (const name of ["Mandat", "Avenant"]) {
      await row(page, name).getByRole("button", { name: /^Actions pour/ }).click();
      await page.getByRole("menuitem", { name: "Supprimer", exact: true }).click();
      await dialog(page).locator("button[type=submit]").click();
      await expect(toast(page)).toContainText("conservé 30 jours dans la corbeille");
    }
    await bin(page);
    await expect(main(page).locator("[data-bin-notice]")).toContainText("conservés 30 jours");
    await expect(row(page, "Mandat")).toBeVisible();
    await main(page).getByRole("button", { name: "Vider la corbeille" }).click();
    await dialog(page).locator("button[type=submit]").click();
    await expect(row(page, "Mandat")).toHaveCount(0);
    await expect(row(page, "Avenant")).toHaveCount(0);
    await expect(main(page).getByRole("button", { name: "Vider la corbeille" })).toBeDisabled();
  });

  test("erases for good what was deleted more than thirty days ago, the original with it", async ({ page }) => {
    await seeded(page);
    for (const name of ["Mandat", "Avenant"]) {
      await row(page, name).getByRole("button", { name: /^Actions pour/ }).click();
      await page.getByRole("menuitem", { name: "Supprimer", exact: true }).click();
      await dialog(page).locator("button[type=submit]").click();
    }
    await expect(row(page, "Avenant")).toHaveCount(0);
    // Make one of the two deletions thirty-one days old, as the clock will.
    const keysBefore = await page.evaluate(async () => {
      const conn = await new Promise<IDBDatabase>((res) => {
        const r = indexedDB.open("ndf-vault");
        r.onsuccess = () => res(r.result);
      });
      const state = await new Promise<{ files: { name: string; deletedAt?: string }[] }>((res) => {
        const r = conn.transaction("state").objectStore("state").get("vault");
        r.onsuccess = () => res(r.result);
      });
      state.files.find((f) => f.name === "Mandat")!.deletedAt = new Date(Date.now() - 31 * 86_400_000).toISOString();
      await new Promise<void>((res) => {
        const tx = conn.transaction("state", "readwrite");
        tx.objectStore("state").put(state, "vault");
        tx.oncomplete = () => res();
      });
      const keys = await new Promise<IDBValidKey[]>((res) => {
        const r = conn.transaction("blobs").objectStore("blobs").getAllKeys();
        r.onsuccess = () => res(r.result);
      });
      conn.close();
      return keys.map(String).filter((k) => k.startsWith("f-")).length;
    });
    expect(keysBefore).toBe(3);
    await page.reload();
    await bin(page);
    await expect(row(page, "Avenant")).toBeVisible();
    await expect(row(page, "Mandat")).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const open = indexedDB.open("ndf-vault");
              open.onsuccess = () => {
                const all = open.result.transaction("blobs").objectStore("blobs").getAllKeys();
                all.onsuccess = () => resolve(all.result.map(String).filter((k) => k.startsWith("f-")).length);
              };
            }),
        ),
      )
      .toBe(2);
    await go(page, "activity");
    await expect(main(page)).toContainText("a laissé la corbeille se vider : 1 fichier supprimé depuis plus de 30 jours");
  });
});

test.describe("space used", () => {
  test("is shown at the foot of the sidebar", async ({ page }) => {
    await seeded(page);
    const meter = page.locator("aside [data-storage-meter]").first();
    await expect(meter).toContainText(/utilisés sur/);
    await expect(meter.getByRole("progressbar", { name: "Espace utilisé" })).toBeVisible();
  });
});
