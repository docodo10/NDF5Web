import { expect, test } from "@playwright/test";
import { dialog, go, main, openVault, row, sidebar, textFile, toast, upload } from "./helpers";

const tree = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Dossiers" });
const folderMenu = async (page: import("@playwright/test").Page, item: string) => {
  await main(page).getByRole("button", { name: "Actions du dossier" }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
};

test("creates, renames, moves and deletes a folder", async ({ page }) => {
  await openVault(page, "folder-legal");
  await main(page).getByRole("button", { name: "Nouveau dossier" }).click();
  await page.fill("#new-folder-name", "Contrats signés");
  await page.keyboard.press("Enter");
  await expect(main(page).getByRole("heading", { name: "Contrats signés" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Fil d’Ariane" })).toContainText("Juridique et chaîne de titres");

  await folderMenu(page, "Renommer");
  await page.fill("#folder-name", "Ententes signées");
  await page.keyboard.press("Enter");
  await expect(main(page).getByRole("heading", { name: "Ententes signées" })).toBeVisible();
  await expect(tree(page)).toContainText("Ententes signées");

  await folderMenu(page, "Déplacer");
  // It cannot be moved into itself or left where it already is.
  await expect(dialog(page).getByRole("option", { name: /Ententes signées/ })).toBeDisabled();
  await expect(dialog(page).getByRole("option", { name: /Juridique et chaîne de titres/ })).toBeDisabled();
  await dialog(page).getByRole("option", { name: /Signés/ }).click();
  await dialog(page).getByRole("button", { name: "Déplacer ici" }).click();
  await expect(page.getByRole("navigation", { name: "Fil d’Ariane" })).toContainText("Signés");

  await folderMenu(page, "Supprimer");
  await dialog(page).getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(toast(page)).toHaveText(/Dossier « Ententes signées » supprimé/);
  await expect(tree(page)).not.toContainText("Ententes signées");
});

test("refuses to delete a folder that still holds files, even deleted ones", async ({ page }) => {
  await openVault(page, "folder-legal");
  await main(page).getByRole("button", { name: "Nouveau dossier" }).click();
  await page.fill("#new-folder-name", "À trier");
  await page.keyboard.press("Enter");
  await upload(page, [textFile("Note.txt", "à garder")]);
  await expect(row(page, "Note")).toBeVisible();

  await folderMenu(page, "Supprimer");
  await expect(dialog(page)).toContainText("Ce dossier ne peut pas être supprimé");
  await expect(dialog(page)).toContainText("contient 1 fichier");
  await dialog(page).getByRole("button", { name: "Fermer", exact: true }).last().click();

  // A file sent to Deleted still lives in the folder: it would be lost with it.
  await row(page, "Note").getByRole("button", { name: /^Actions pour/ }).click();
  await page.getByRole("menuitem", { name: "Supprimer", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Supprimer", exact: true }).click();
  await folderMenu(page, "Supprimer");
  await expect(dialog(page)).toContainText("fichiers archivés et supprimés compris");
});

test("keeps the numbered index in place", async ({ page }) => {
  await openVault(page, "folder-legal");
  await folderMenu(page, "Déplacer");
  await expect(toast(page)).toHaveText("Les dossiers numérotés de l’index restent à leur place.");
  await folderMenu(page, "Supprimer");
  await expect(dialog(page)).toContainText("Les dossiers numérotés de l’index ne peuvent pas être supprimés.");
});

test("creates, edits, archives and restores a project", async ({ page }) => {
  await openVault(page, "projects");
  await main(page).getByRole("button", { name: "Nouveau projet" }).click();
  await page.fill("#new-project-name", "Production Blitz Three");
  await dialog(page).getByPlaceholder("PB3").fill("pb3");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#project-p-/);
  await expect(main(page).getByRole("heading", { name: "Production Blitz Three" })).toBeVisible();
  // Its folder is created under 04 Production.
  await main(page).getByRole("button", { name: "Ouvrir le dossier" }).click();
  await expect(page.getByRole("navigation", { name: "Fil d’Ariane" })).toContainText("Production");
  await page.goBack();

  await main(page).getByRole("button", { name: "Actions du projet" }).click();
  await page.getByRole("menuitem", { name: "Modifier le projet" }).click();
  await page.fill("#project-name", "Production Blitz Trois");
  await page.fill("#project-period", "Production prévue en 2035");
  await dialog(page).locator("button[type=submit]").click();
  await expect(main(page).getByRole("heading", { name: "Production Blitz Trois" })).toBeVisible();
  await expect(main(page)).toContainText("Production prévue en 2035");

  await main(page).getByRole("button", { name: "Actions du projet" }).click();
  await page.getByRole("menuitem", { name: "Archiver le projet" }).click();
  await expect(main(page)).toContainText("Projet archivé");

  await sidebar(page).getByRole("button", { name: "Tous les projets" }).click();
  await expect(main(page).getByRole("button", { name: /Production Blitz Trois/ })).toHaveCount(0);
  await page.getByRole("tab", { name: /Archivés/ }).click();
  await main(page).getByRole("button", { name: /Production Blitz Trois/ }).click();
  await main(page).getByRole("button", { name: "Actions du projet" }).click();
  await page.getByRole("menuitem", { name: "Restaurer le projet" }).click();
  await go(page, "projects");
  await expect(main(page).getByRole("button", { name: /Production Blitz Trois/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Archivés/ })).toHaveCount(0);
});

test("a project page sorts its files into sections", async ({ page }) => {
  await openVault(page, "project-pb1");
  await page.getByRole("tab", { name: "Documents financiers", exact: true }).click();
  await expect(main(page)).toContainText("Sommaire du budget de production PB1");
  await page.getByRole("tab", { name: "Juridique", exact: true }).click();
  await expect(main(page)).toContainText("rien pour l’instant");
  await page.getByRole("tab", { name: "Équipe", exact: true }).click();
  await expect(main(page)).toContainText("Bureau de production");
});
