import { expect, test } from "@playwright/test";
import { dialog, docxFile, go, openVault, pptxFile, protect, row, unlock, upload, xlsxFile } from "./helpers";
import { para, table } from "../fixtures/office";

const body = (page: import("@playwright/test").Page) => dialog(page).locator("[data-viewer-canvas]");

test("previews a Word document: headings, emphasis, lists and tables", async ({ page }) => {
  await openVault(page);
  const content =
    para("Entente de coproduction", { style: "Titre1" }) +
    para("Article 1 — Objet", { style: "Titre2" }) +
    para("Clause importante.", { props: "<w:b/>" }) +
    para("Premier point", { list: true }) +
    table([["Poste", "Responsable"], ["Décors", "Service production"]]) +
    `<w:p><w:r><w:br w:type="page"/></w:r></w:p>` +
    para("<img src=x onerror=alert(1)> & <b>pas du gras</b>");
  await upload(page, [docxFile("Entente.docx", content)], "legal");
  await row(page, "Entente").click();

  const doc = body(page).locator("[data-office=docx]");
  await expect(doc.getByRole("heading", { level: 2, name: "Entente de coproduction" })).toBeVisible();
  await expect(doc.getByRole("heading", { level: 3, name: "Article 1 — Objet" })).toBeVisible();
  expect(await doc.getByText("Clause importante.").evaluate((e) => Number(getComputedStyle(e).fontWeight))).toBeGreaterThanOrEqual(600);
  await expect(doc.getByRole("cell", { name: "Service production" })).toBeVisible();
  await expect(doc.getByRole("separator")).toHaveText("Saut de page");
  // Text from the document is shown as text, never run or rendered as markup.
  await expect(doc).toContainText("<img src=x onerror=alert(1)> & <b>pas du gras</b>");
  expect(await doc.locator("img, b, script").count()).toBe(0);
  // The preview says what it is, and carries the viewer's watermark.
  await expect(body(page).locator("[data-simplified-note]")).toContainText("Aperçu simplifié");
  await expect(doc.locator("[data-personal-watermark]")).toContainText("Admin NDF5");
  // Zoom works on it like on any document.
  const before = (await doc.boundingBox())!.width;
  await dialog(page).getByRole("button", { name: "Zoom avant" }).click();
  await expect.poll(async () => (await doc.boundingBox())!.width).toBeGreaterThan(before);
});

test("previews a workbook sheet by sheet, hidden sheets included", async ({ page }) => {
  await openVault(page);
  await upload(
    page,
    [
      xlsxFile("Budget.xlsx", [
        { name: "Sommaire", rows: [["Poste", "Montant", "Échéance", "Part"], ["Décors", 1200.5, { v: 46340, s: 1 }, { v: 0.25, s: 2 }], ["Total", { f: "SUM(B2:B2)", v: 1200.5 }, null, null]] },
        { name: "Marges", rows: [["Confidentiel"], [42]], hidden: true },
      ]),
    ],
    "business",
  );
  await row(page, "Budget").click();

  const sheet = body(page).locator("[data-office=xlsx]");
  const tabs = sheet.getByRole("tablist", { name: "Feuilles du classeur" });
  await expect(tabs.getByRole("tab")).toHaveText(["Sommaire", "Marges"]);
  await expect(tabs.getByRole("tab", { name: "Sommaire" })).toHaveAttribute("aria-selected", "true");
  // Column letters and row numbers, as in a spreadsheet.
  await expect(sheet.getByRole("columnheader")).toHaveText(["", "A", "B", "C", "D"]);
  await expect(sheet.getByRole("row").nth(2)).toHaveText("2Décors1200,52026-11-1425 %");
  await expect(sheet.getByRole("row").nth(3)).toContainText("Total1200,5");
  // A hidden sheet is still in the file: it is shown, and flagged.
  await expect(sheet.getByText("Feuille masquée dans Excel")).toBeHidden();
  await tabs.getByRole("tab", { name: "Marges" }).click();
  await expect(sheet.getByText("Feuille masquée dans Excel")).toBeVisible();
  await expect(sheet.getByRole("cell", { name: "Confidentiel" })).toBeVisible();
});

test("previews a presentation in show order, with speaker notes and hidden slides", async ({ page }) => {
  await openVault(page);
  await upload(
    page,
    [
      pptxFile("Pitch.pptx", [
        { title: "Présentation du projet", lines: ["Document de travail"] },
        { title: "Calendrier", lines: ["Préproduction", { text: "Repérages", level: 1 }], notes: "Ne pas annoncer de date ferme." },
        { title: "Annexe", lines: ["Détails"], hidden: true },
      ]),
    ],
    "overview",
  );
  await row(page, "Pitch").click();

  const slides = body(page).locator("[data-office=pptx]").getByRole("listitem").filter({ has: page.getByRole("heading") });
  await expect(slides).toHaveCount(3);
  await expect(slides.getByRole("heading")).toHaveText(["Présentation du projet", "Calendrier", "Annexe"]);
  await expect(slides.nth(1)).toContainText("2 / 3");
  await expect(slides.nth(1)).toContainText("Repérages");
  await expect(slides.nth(1)).toContainText("Notes du présentateur");
  await expect(slides.nth(1)).toContainText("Ne pas annoncer de date ferme.");
  await expect(slides.nth(0)).not.toContainText("Notes du présentateur");
  await expect(slides.nth(2)).toContainText("Diapositive masquée");
  await expect(slides.nth(0).locator("[data-personal-watermark]")).toHaveCount(1);
});

test("keeps Office previews working when the vault is encrypted and after a reload", async ({ page }) => {
  await openVault(page);
  await upload(page, [docxFile("Mémo.docx", para("Contenu chiffré au repos."))], "legal");
  await protect(page);
  await page.reload();
  await unlock(page);
  await go(page, "folder-legal");
  await row(page, "Mémo").click();
  await expect(body(page).locator("[data-office=docx]")).toContainText("Contenu chiffré au repos.");
});
