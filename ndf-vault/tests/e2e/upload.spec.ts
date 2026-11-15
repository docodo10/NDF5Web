import { expect, test } from "@playwright/test";
import { dialog, docxFile, downloaded, EXE, fakeOffice, go, main, openVault, pdfFile, pngFile, row, rows, textFile, toast, upload } from "./helpers";
import { docx, para } from "../fixtures/office";

test("uploads real files and keeps them after a reload", async ({ page }) => {
  await openVault(page);
  await upload(page, [await pdfFile("Contrat de test.pdf"), pngFile("Affiche test.png"), textFile("Notes.txt", "Première ligne.\nDeuxième ligne é à ç.\n"), textFile("Budget.csv", "Poste,Montant\nDécors,1200\n"), docxFile("Lettre.docx")], "legal");
  await expect(toast(page)).toHaveText(/5 fichiers téléversés/);
  await expect(page).toHaveURL(/#folder-legal$/);
  for (const name of ["Contrat de test", "Affiche test", "Notes", "Budget", "Lettre"]) await expect(row(page, name)).toBeVisible();

  await page.reload();
  await expect(main(page)).toBeVisible();
  for (const name of ["Contrat de test", "Affiche test", "Notes", "Budget", "Lettre"]) await expect(row(page, name)).toBeVisible();
});

test("refuses files it should not accept, and says why", async ({ page }) => {
  await openVault(page);
  await main(page).getByRole("button", { name: "Téléverser" }).first().click();
  const d = dialog(page);
  await d.locator("#upload-input").setInputFiles([
    { name: "virus.exe", mimeType: "application/octet-stream", buffer: EXE },
    { name: "vide.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) },
    { name: "facture.pdf", mimeType: "application/pdf", buffer: EXE }, // an executable renamed
    { name: "page.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html><script>alert(1)</script></html>") },
    { name: "image.png", mimeType: "image/png", buffer: Buffer.from("<svg onload=alert(1)>") },
    { name: "notes.txt", mimeType: "text/plain", buffer: EXE },
    { name: "dessin.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") },
    fakeOffice("archive.docx"), // a ZIP, but not a Word document
    { name: "macro.docx", mimeType: "application/octet-stream", buffer: docx(para("x"), [{ name: "word/vbaProject.bin", data: "macro" }]) },
  ]);
  const list = d.getByRole("list", { name: "Fichiers choisis" });
  await expect(list.getByRole("listitem")).toHaveCount(9);
  await expect(list.getByRole("listitem").filter({ hasText: "archive.docx" })).toContainText("Ce fichier n’est pas un document Word valide.");
  await expect(list.getByRole("listitem").filter({ hasText: "macro.docx" })).toContainText("Ce fichier contient des macros ou des contrôles actifs : il est refusé.");
  await expect(list.getByRole("listitem").filter({ hasText: "virus.exe" })).toContainText("Le format .exe n’est pas accepté.");
  await expect(list.getByRole("listitem").filter({ hasText: "vide.pdf" })).toContainText("Ce fichier est vide.");
  for (const name of ["facture.pdf", "page.pdf", "image.png", "notes.txt"]) await expect(list.getByRole("listitem").filter({ hasText: name })).toContainText("Le contenu ne correspond pas à l’extension");
  await expect(list.getByRole("listitem").filter({ hasText: "dessin.svg" })).toContainText("Le format .svg n’est pas accepté.");
  // Nothing valid: there is nothing to send.
  await expect(d.locator("button[type=submit]")).toBeDisabled();
});

test("points out a file the vault already holds", async ({ page }) => {
  await openVault(page);
  const contract = await pdfFile("Contrat.pdf");
  await upload(page, [contract], "legal");
  await main(page).getByRole("button", { name: "Téléverser" }).first().click();
  await dialog(page).locator("#upload-input").setInputFiles([{ ...contract, name: "Copie du contrat.pdf" }, textFile("a.txt", "même contenu"), textFile("b.txt", "même contenu")]);
  const list = dialog(page).getByRole("list", { name: "Fichiers choisis" });
  await expect(list.getByRole("listitem").filter({ hasText: "Copie du contrat.pdf" })).toContainText("Identique à « Contrat.pdf »");
  await expect(list.getByRole("listitem").filter({ hasText: /Identique à « [ab]\.txt »/ })).toHaveCount(1);
});

test("accepts files dropped anywhere on the window", async ({ page }) => {
  await openVault(page, "folder-screenplays");
  const data = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(new File(["Scène 1. Intérieur, jour."], "Scène déposée.txt", { type: "text/plain" }));
    return d;
  });
  await page.dispatchEvent("body", "dragenter", { dataTransfer: data });
  await expect(page.getByText("Déposez pour téléverser")).toBeVisible();
  await page.dispatchEvent("body", "drop", { dataTransfer: data });
  const d = dialog(page);
  await expect(d.getByRole("list", { name: "Fichiers choisis" })).toContainText("Scène déposée.txt");
  // The folder being viewed is the destination.
  await expect(d.locator("#upload-folder")).toHaveValue("screenplays");
  await d.locator("button[type=submit]").click();
  await expect(row(page, "Scène déposée")).toBeVisible();
});

test("previews a real PDF, an image, text, CSV and a Word document", async ({ page }) => {
  await openVault(page);
  await upload(page, [await pdfFile("Contrat.pdf", 3), pngFile("Affiche.png", 640, 400), textFile("Notes.txt", "Première ligne.\nDeuxième ligne é à ç.\n"), textFile("Budget.csv", "Poste,Montant\nDécors,\"1 200\"\n"), docxFile("Lettre.docx")], "legal");
  const viewer = dialog(page);
  const body = viewer.locator("[data-viewer-canvas]");

  await row(page, "Contrat").click();
  await expect(viewer.locator("[data-page-indicator]")).toHaveText("1 / 3");
  // The page really is drawn: the canvas holds dark pixels where the text is.
  await expect
    .poll(() =>
      body.locator("canvas").first().evaluate((c: HTMLCanvasElement) => {
        const px = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
        let dark = 0;
        for (let i = 0; i < px.length; i += 16) if (px[i] < 100 && px[i + 3] > 0) dark++;
        return dark;
      }),
    )
    .toBeGreaterThan(20);
  await viewer.getByRole("button", { name: "Aller à la page 3" }).click();
  await expect(viewer.locator("[data-page-indicator]")).toHaveText("3 / 3");
  await page.keyboard.press("Escape");

  await row(page, "Affiche").click();
  await expect(body.locator("img")).toBeVisible();
  expect(await body.locator("img").evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(640);
  await page.keyboard.press("Escape");

  await row(page, "Notes").click();
  await expect(body).toContainText("Deuxième ligne é à ç.");
  await page.keyboard.press("Escape");

  await row(page, "Budget").click();
  await expect(body.getByRole("cell", { name: "1 200" })).toBeVisible();
  await page.keyboard.press("Escape");

  await row(page, "Lettre").click();
  await expect(body.locator("[data-office=docx]")).toContainText("Lettre de test.");
});

test("downloads the original byte for byte", async ({ page }) => {
  await openVault(page);
  const contract = await pdfFile("Contrat.pdf");
  await upload(page, [contract], "legal");
  const [download] = await Promise.all([page.waitForEvent("download"), row(page, "Contrat").getByRole("button", { name: /^Télécharger / }).click()]);
  expect(download.suggestedFilename()).toBe("Contrat.pdf");
  expect((await downloaded(download)).equals(contract.buffer)).toBe(true);

  // The journal records it.
  await go(page, "activity");
  await expect(main(page)).toContainText("a téléchargé Contrat.pdf");
  await expect(main(page)).toContainText("a téléversé Contrat.pdf");
});

test("says so when a sample file has no original to download", async ({ page }) => {
  await openVault(page, "files");
  await row(page, "Mot de bienvenue").getByRole("button", { name: /^Télécharger / }).click();
  await expect(toast(page)).toHaveText(/Fichier d’exemple : il n’a pas d’original/);
  await expect(rows(page)).toHaveCount(10);
});
