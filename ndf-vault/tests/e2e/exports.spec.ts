import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { dialog, downloaded, go, main, openVault, pdfFile, pngFile, readZip, row, rowMenu, textFile, toast, upload } from "./helpers";

test("exports a selection as a ZIP whose files are intact", async ({ page }) => {
  await openVault(page);
  const contract = await pdfFile("Contrat.pdf");
  const notes = textFile("Notes é.txt", "contenu accentué é à ç");
  await upload(page, [contract, notes], "legal");

  await row(page, "Contrat").getByRole("checkbox").click();
  await row(page, "Notes é").getByRole("checkbox").click();
  // A sample file in the selection has no original and is simply left out.
  await row(page, "Modèle de contrat d’option").getByRole("checkbox").click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("toolbar", { name: "Actions groupées" }).getByRole("button", { name: /Exporter \(ZIP\)/ }).click()]);
  expect(download.suggestedFilename()).toBe("ndf-vault-selection.zip");
  const entries = readZip(await downloaded(download));
  expect(entries.map((e) => e.name).sort()).toEqual(["06 Juridique et chaîne de titres/Contrat.pdf", "06 Juridique et chaîne de titres/Notes é.txt"]);
  expect(entries.find((e) => e.name.endsWith("Contrat.pdf"))!.data.equals(contract.buffer)).toBe(true);
  expect(entries.find((e) => e.name.endsWith(".txt"))!.data.toString("utf8")).toBe("contenu accentué é à ç");
  await expect(toast(page)).toHaveText(/2 fichiers exportés/);
});

test("exports a folder and the whole vault, with a manifest", async ({ page }) => {
  await openVault(page);
  await upload(page, [await pdfFile("Contrat.pdf")], "legal");
  await go(page, "home");
  await upload(page, [textFile("Scène 1.txt", "Intérieur, jour.")], "screenplays");

  await main(page).getByRole("button", { name: "Actions du dossier" }).click();
  const [folderZip] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Exporter en ZIP" }).click()]);
  expect(folderZip.suggestedFilename()).toBe("Scénarios.zip");
  expect(readZip(await downloaded(folderZip)).map((e) => e.name)).toEqual(["02 Scénarios/Scène 1.txt"]);

  await go(page, "preferences");
  const [vaultZip] = await Promise.all([page.waitForEvent("download"), main(page).getByRole("button", { name: "Exporter", exact: true }).click()]);
  expect(vaultZip.suggestedFilename()).toMatch(/^ndf-vault-\d{4}-\d{2}-\d{2}\.zip$/);
  const entries = readZip(await downloaded(vaultZip));
  expect(entries.map((e) => e.name).sort()).toEqual(["02 Scénarios/Scène 1.txt", "06 Juridique et chaîne de titres/Contrat.pdf", "manifeste.json"]);
  const manifest = JSON.parse(entries.find((e) => e.name === "manifeste.json")!.data.toString("utf8"));
  expect(manifest.fichiers).toHaveLength(2);
  for (const f of manifest.fichiers) expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
});

test("says so when there is nothing real to export", async ({ page }) => {
  await openVault(page, "files");
  await row(page, "Mot de bienvenue").getByRole("checkbox").click();
  await page.getByRole("toolbar", { name: "Actions groupées" }).getByRole("button", { name: /Exporter \(ZIP\)/ }).click();
  await expect(toast(page)).toHaveText(/Rien à exporter/);
});

test("a stamped download is a valid PDF with the same pages", async ({ page }) => {
  await openVault(page);
  const contract = await pdfFile("Contrat.pdf", 3);
  await upload(page, [contract], "legal");
  const [download] = await Promise.all([page.waitForEvent("download"), rowMenu(page, "Contrat", "Télécharger avec filigrane")]);
  expect(download.suggestedFilename()).toBe("Contrat (filigrané).pdf");
  const stamped = await downloaded(download);
  expect(stamped.equals(contract.buffer)).toBe(false);
  expect((await PDFDocument.load(stamped)).getPageCount()).toBe(3);
  // The stored original is untouched.
  const [original] = await Promise.all([page.waitForEvent("download"), rowMenu(page, "Contrat", "Télécharger")]);
  expect((await downloaded(original)).equals(contract.buffer)).toBe(true);
  await go(page, "activity");
  await expect(main(page)).toContainText("a téléchargé avec filigrane Contrat.pdf");
});

test("a stamped image keeps its size and changes its pixels", async ({ page }) => {
  await openVault(page);
  const image = pngFile("Affiche.png", 400, 240);
  await upload(page, [image], "overview");
  const [download] = await Promise.all([page.waitForEvent("download"), rowMenu(page, "Affiche", "Télécharger avec filigrane")]);
  expect(download.suggestedFilename()).toBe("Affiche (filigrané).png");
  const stamped = await downloaded(download);
  expect(stamped.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
  expect(stamped.readUInt32BE(16)).toBe(400);
  expect(stamped.readUInt32BE(20)).toBe(240);
  expect(stamped.equals(image.buffer)).toBe(false);
});

test("files that cannot be stamped do not offer it", async ({ page }) => {
  await openVault(page);
  await upload(page, [textFile("Notes.txt", "texte")], "legal");
  await row(page, "Notes").getByRole("button", { name: /^Actions pour/ }).click();
  await expect(page.getByRole("menuitem", { name: "Télécharger", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Télécharger avec filigrane" })).toHaveCount(0);
});

test("the viewer shows who is looking and when, and follows the profile", async ({ page }) => {
  await openVault(page);
  await upload(page, [await pdfFile("Contrat.pdf", 1)], "legal");
  await row(page, "Contrat").click();
  const mark = dialog(page).locator("[data-viewer-canvas] [data-personal-watermark]").first();
  await expect(mark).toContainText("Admin NDF5");
  await expect(mark).toContainText("Confidentiel – NDF5");
  await expect(mark).toContainText(String(new Date().getFullYear()));
  await page.keyboard.press("Escape");

  await go(page, "preferences");
  await page.fill("#profile-name", "Alex Martin");
  await page.fill("#profile-email", "alex@example.com");
  await main(page).getByRole("button", { name: "Enregistrer le profil" }).click();
  await go(page, "folder-legal");
  await row(page, "Contrat").click();
  await expect(mark).toContainText("Alex Martin · NDF5 Productions · alex@example.com");
  await page.keyboard.press("Escape");

  await go(page, "preferences");
  await page.getByRole("switch", { name: "Filigrane personnel" }).click();
  await go(page, "folder-legal");
  await row(page, "Contrat").click();
  await expect(dialog(page).locator("[data-viewer-canvas] canvas").first()).toBeVisible();
  await expect(dialog(page).locator("[data-personal-watermark]")).toHaveCount(0);
});

test("exports the journal as CSV", async ({ page }) => {
  await openVault(page);
  await upload(page, [textFile("Notes.txt", "texte")], "legal");
  await go(page, "activity");
  const [download] = await Promise.all([page.waitForEvent("download"), main(page).getByRole("button", { name: "Exporter (CSV)" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^journal-ndf-vault-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = (await downloaded(download)).toString("utf8");
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text).toContain("Date,Heure,Qui,Action,Élément,Projet,Type");
  expect(text).toContain("Admin NDF5,a téléversé,Notes.txt,,Fichier");
});
