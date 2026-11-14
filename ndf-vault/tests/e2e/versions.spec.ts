import { expect, test } from "@playwright/test";
import { dialog, downloaded, openVault, pdfFile, pngFile, row, rowMenu, toast, upload } from "./helpers";

test("keeps earlier versions, and can download, restore and delete them", async ({ page }) => {
  await openVault(page);
  const v1 = await pdfFile("Contrat.pdf", 1, "Version un");
  const v2 = await pdfFile("Contrat.pdf", 2, "Version deux");
  await upload(page, [v1], "legal");

  await rowMenu(page, "Contrat", "Historique des versions");
  const d = dialog(page);
  const list = d.getByRole("list", { name: "Versions" });
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await d.locator("#version-input").setInputFiles(v2);
  await expect(toast(page)).toHaveText(/Nouvelle version enregistrée/);
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list.getByRole("listitem").first()).toContainText("Version 2");
  await expect(list.getByRole("listitem").first()).toContainText("Actuelle");

  // The earlier version is still there, byte for byte.
  const [old] = await Promise.all([page.waitForEvent("download"), d.getByRole("button", { name: "Télécharger la version 1" }).click()]);
  expect((await downloaded(old)).equals(v1.buffer)).toBe(true);
  expect(old.suggestedFilename()).toMatch(/^Contrat \(version du .+\)\.pdf$/);

  // The file itself now is version 2.
  await d.getByRole("button", { name: "Fermer", exact: true }).last().click();
  const [current] = await Promise.all([page.waitForEvent("download"), row(page, "Contrat").getByRole("button", { name: /^Télécharger / }).click()]);
  expect((await downloaded(current)).equals(v2.buffer)).toBe(true);

  // Restoring swaps them, and nothing is lost.
  await rowMenu(page, "Contrat", "Historique des versions");
  await d.getByRole("button", { name: "Restaurer" }).click();
  await expect(toast(page)).toHaveText(/restaurée/);
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await d.getByRole("button", { name: "Fermer", exact: true }).last().click();
  const [restored] = await Promise.all([page.waitForEvent("download"), row(page, "Contrat").getByRole("button", { name: /^Télécharger / }).click()]);
  expect((await downloaded(restored)).equals(v1.buffer)).toBe(true);

  // Versions survive a reload, and can be deleted.
  await page.reload();
  await rowMenu(page, "Contrat", "Historique des versions");
  await expect(list.getByRole("listitem")).toHaveCount(2);
  const [kept] = await Promise.all([page.waitForEvent("download"), d.getByRole("button", { name: "Télécharger la version 1" }).click()]);
  expect((await downloaded(kept)).equals(v2.buffer)).toBe(true);
  await d.getByRole("button", { name: "Supprimer la version 1" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);
});

test("refuses a new version of another format, or identical to the current one", async ({ page }) => {
  await openVault(page);
  const v1 = await pdfFile("Contrat.pdf", 1, "Version un");
  await upload(page, [v1], "legal");
  await rowMenu(page, "Contrat", "Historique des versions");
  const d = dialog(page);

  await d.locator("#version-input").setInputFiles(pngFile("Contrat.png"));
  await expect(d.getByRole("alert")).toHaveText("La nouvelle version doit être au même format (.pdf).");
  await d.locator("#version-input").setInputFiles(v1);
  await expect(d.getByRole("alert")).toHaveText("Ce fichier est identique à la version actuelle.");
  // A file that only claims to be a PDF is refused like any upload.
  await d.locator("#version-input").setInputFiles({ name: "Contrat.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ pas un pdf") });
  await expect(d.getByRole("alert")).toHaveText(/Le contenu ne correspond pas/);
  await expect(d.getByRole("list", { name: "Versions" }).getByRole("listitem")).toHaveCount(1);
});

test("sample files explain that they have no versions", async ({ page }) => {
  await openVault(page, "files");
  await rowMenu(page, "Mot de bienvenue", "Historique des versions");
  await expect(dialog(page)).toContainText("Fichier d’exemple : il n’a pas d’original, donc pas de versions.");
  await expect(dialog(page).getByRole("button", { name: "Nouvelle version" })).toHaveCount(0);
});
