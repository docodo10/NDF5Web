import { expect, test } from "@playwright/test";
import { dialog, diskDump, docxFile, go, main, openVault, pdfFile, pptxFile, protect, row, textFile, unlock, upload, xlsxFile } from "./helpers";
import { para } from "../fixtures/office";

type Page = import("@playwright/test").Page;

const palette = (page: Page) => page.getByRole("dialog", { name: "Rechercher dans NDF Vault" });
const contentHits = (page: Page) => palette(page).locator("button", { has: page.locator("[data-excerpt]") });

async function search(page: Page, query: string) {
  if (!(await palette(page).isVisible())) await page.keyboard.press("Control+k");
  await palette(page).getByRole("textbox").fill(query);
}

/** Wait until every uploaded document has been read into the index. */
async function indexed(page: Page) {
  await search(page, "zzzz");
  await expect(palette(page).locator("[data-indexing]")).toHaveCount(0, { timeout: 20_000 });
}

test.describe("search inside documents", () => {
  test("finds words in PDF, Word, Excel, PowerPoint and text files, whatever their case or accents", async ({ page }) => {
    await openVault(page);
    await upload(
      page,
      [
        await pdfFile("Contrat.pdf", 3, "Clause de garantie"),
        docxFile("Entente.docx", para("Les décors seront livrés à Montréal avant le tournage.")),
        xlsxFile("Budget.xlsx", [{ name: "Sommaire", rows: [["Poste", "Montant"], ["Costumes d’époque", 860]] }]),
        pptxFile("Pitch.pptx", [{ title: "Ouverture" }, { title: "Calendrier", lines: ["Repérages en Gaspésie"], notes: "Ne pas annoncer de date ferme." }]),
        textFile("Notes.txt", "Rappel : vérifier l’assurance du matériel."),
      ],
      "legal",
    );
    await indexed(page);

    await search(page, "DECORS montreal");
    await expect(contentHits(page)).toHaveCount(1);
    await expect(contentHits(page)).toContainText("Entente.docx");
    await expect(contentHits(page).locator("mark")).toHaveText("décors");

    await search(page, "costumes");
    await expect(contentHits(page)).toContainText("Budget.xlsx");
    await search(page, "gaspésie");
    await expect(contentHits(page)).toContainText("Pitch.pptx");
    await expect(contentHits(page)).toContainText("Diapositive 2");
    // Speaker notes are part of the file, so they are searched too.
    await search(page, "date ferme");
    await expect(contentHits(page)).toContainText("Pitch.pptx");
    await search(page, "assurance");
    await expect(contentHits(page)).toContainText("Notes.txt");
    // A name still matches by name; a word found nowhere gives nothing.
    await search(page, "licorne violette");
    await expect(palette(page)).toContainText("Aucun résultat");
  });

  test("opens the document at the page where the match is", async ({ page }) => {
    await openVault(page);
    await upload(page, [await pdfFile("Contrat.pdf", 4, "Annexe")], "legal");
    await indexed(page);
    // Each page of the fixture reads "Annexe - page N".
    await search(page, "page 3");
    await expect(contentHits(page)).toContainText("Page 3");
    await contentHits(page).click();
    await expect(dialog(page).locator("[data-page-indicator]")).toHaveText("3 / 4");
  });

  test("shows text from documents as text, never as markup", async ({ page }) => {
    await openVault(page);
    await upload(page, [textFile("Piège.txt", "avant <img src=x onerror=alert(1)> balise après")], "legal");
    await indexed(page);
    await search(page, "balise");
    await expect(contentHits(page)).toContainText("<img src=x onerror=alert(1)>");
    expect(await palette(page).locator("img").count()).toBe(0);
  });

  test("keeps the index encrypted, rebuilds nothing after unlocking, and forgets purged files", async ({ page }) => {
    await openVault(page);
    await upload(page, [textFile("Entente.txt", "Clause confidentielle numéro quarante-deux")], "legal");
    await indexed(page);
    await page.keyboard.press("Escape");
    expect(await diskDump(page)).toContain("quarante-deux");

    await protect(page);
    // Neither the original nor the text taken from it is readable on disk.
    expect(await diskDump(page)).not.toContain("quarante-deux");
    await page.reload();
    await unlock(page);
    await search(page, "quarante-deux");
    await expect(contentHits(page)).toContainText("Entente.txt");
    await page.keyboard.press("Escape");

    // Deleted for good: gone from the search, and its text gone from the disk.
    await go(page, "folder-legal");
    await row(page, "Entente").getByRole("button", { name: /^Actions pour/ }).click();
    await page.getByRole("menuitem", { name: "Supprimer", exact: true }).click();
    await dialog(page).locator("button[type=submit]").click();
    await search(page, "quarante-deux");
    await expect(contentHits(page)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await go(page, "archived");
    await main(page).getByRole("tab", { name: /Supprimés/ }).click();
    await row(page, "Entente").getByRole("checkbox").click();
    await page.getByRole("toolbar", { name: "Actions groupées" }).getByRole("button", { name: /Supprimer définitivement/ }).click();
    await dialog(page).locator("button[type=submit]").click();
    await expect(row(page, "Entente")).toHaveCount(0);
    const keys = await page.evaluate(
      () =>
        new Promise<string[]>((resolve) => {
          const open = indexedDB.open("ndf-vault");
          open.onsuccess = () => {
            const all = open.result.transaction("blobs").objectStore("blobs").getAllKeys();
            all.onsuccess = () => resolve(all.result.map(String));
          };
        }),
    );
    expect(keys).toEqual([]);
  });

  test("follows a new version of a file", async ({ page }) => {
    await openVault(page);
    await upload(page, [textFile("Mémo.txt", "première rédaction avec girafe")], "legal");
    await indexed(page);
    await page.keyboard.press("Escape");
    await row(page, "Mémo").getByRole("button", { name: /^Actions pour/ }).click();
    await page.getByRole("menuitem", { name: "Historique des versions", exact: true }).click();
    await dialog(page).locator("#version-input").setInputFiles(textFile("Mémo.txt", "deuxième rédaction avec hippopotame"));
    await expect(dialog(page).getByRole("list", { name: "Versions" }).getByRole("listitem")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await indexed(page);
    await search(page, "hippopotame");
    await expect(contentHits(page)).toContainText("Mémo.txt");
    // The search reflects the current version only.
    await search(page, "girafe");
    await expect(contentHits(page)).toHaveCount(0);
  });
});
