import { expect, test } from "@playwright/test";
import { dialog, go, main, openVault, row, rowMenu, rows, showing, sidebar, toast } from "./helpers";

test.beforeEach(async ({ page }) => {
  await openVault(page, "files");
});

test("lists, sorts and paginates the files", async ({ page }) => {
  await expect(rows(page)).toHaveCount(10);
  await expect(showing(page)).toHaveText("Affichage de 1–10 sur 40");

  await page.getByRole("button", { name: "Nom du fichier" }).click();
  await expect(rows(page).first()).toContainText("Aperçu de la chronologie de la saga");
  await page.getByRole("button", { name: "Taille" }).click();
  await expect(rows(page).first()).toContainText("Présentation de la saga");

  await page.getByRole("button", { name: "Suivant", exact: true }).click();
  await expect(showing(page)).toHaveText("Affichage de 11–20 sur 40");
  await page.getByRole("button", { name: "Précédent", exact: true }).click();
  await main(page).locator("select").selectOption("20");
  await expect(rows(page)).toHaveCount(20);
});

test("filters by type, by text and by status or project", async ({ page }) => {
  await page.getByRole("tab", { name: "PDF", exact: true }).click();
  await expect(showing(page)).toContainText("sur 17");
  await page.getByRole("tab", { name: "Tous les types" }).click();

  const search = page.getByPlaceholder("Rechercher un fichier");
  await search.fill("budget");
  await expect(showing(page)).toContainText("sur 3");
  // The search also reads the status, the folder and the owner.
  await search.fill("brouillon");
  await expect(showing(page)).toContainText("sur 22");
  await search.fill("affaires juridiques");
  await expect(showing(page)).toContainText("sur 3");
  await search.fill("zzzz");
  await expect(main(page).getByText("Aucun fichier ne correspond")).toBeVisible();
  await search.fill("");

  await page.getByRole("button", { name: /Filtres/ }).click();
  await page.getByRole("button", { name: "Brouillon", exact: true }).click();
  await page.getByRole("button", { name: "PB1", exact: true }).click();
  await expect(showing(page)).toContainText("sur 11");
  await page.getByRole("button", { name: "Tout effacer" }).click();
  await expect(showing(page)).toContainText("sur 40");
});

test("renames a file, edits its details, moves it and makes it private", async ({ page }) => {
  await rowMenu(page, "Mot de bienvenue", "Renommer");
  await page.fill("#file-name", "Mot de bienvenue v2");
  await page.keyboard.press("Enter");
  await expect(toast(page)).toHaveText(/Fichier renommé/);
  await expect(row(page, "Mot de bienvenue v2")).toBeVisible();

  await rowMenu(page, "Mot de bienvenue v2", "Modifier les détails");
  await dialog(page).getByRole("button", { name: "Approuvé", exact: true }).first().click();
  await dialog(page).locator("button[type=submit]").click();
  await expect(toast(page)).toHaveText(/Détails enregistrés/);
  await expect(row(page, "Mot de bienvenue v2")).toContainText("Approuvé");

  await rowMenu(page, "Mot de bienvenue v2", "Déplacer");
  await dialog(page).getByRole("option", { name: /Scénarios/ }).click();
  await dialog(page).getByRole("button", { name: "Déplacer ici" }).click();
  await expect(toast(page)).toHaveText(/déplacé vers Scénarios/);
  await expect(row(page, "Mot de bienvenue v2")).toContainText("Scénarios");
  // Undo puts it back.
  await toast(page).getByRole("button", { name: "Annuler" }).click();
  await expect(row(page, "Mot de bienvenue v2")).toContainText("Commencer ici");

  await rowMenu(page, "Mot de bienvenue v2", "Partager");
  await dialog(page).getByRole("button", { name: /Privé/ }).click();
  await dialog(page).locator("button[type=submit]").click();
  await sidebar(page).getByRole("button", { name: "Fichiers privés" }).click();
  await expect(row(page, "Mot de bienvenue v2")).toBeVisible();
});

test("copies, pins and stars a file", async ({ page }) => {
  await rowMenu(page, "Mot de bienvenue", "Copier");
  await expect(row(page, "Mot de bienvenue (copie)")).toBeVisible();

  await rowMenu(page, "Comment utiliser le Vault", "Épingler à l’accueil");
  await row(page, "Comment utiliser le Vault").hover();
  await row(page, "Comment utiliser le Vault").locator("button[aria-pressed]").click();
  await expect(toast(page)).toHaveText(/Ajouté aux favoris/);

  await sidebar(page).getByRole("button", { name: "Favoris" }).click();
  await expect(row(page, "Comment utiliser le Vault")).toBeVisible();
  await sidebar(page).getByRole("button", { name: "Accueil" }).click();
  await expect(page.getByRole("list", { name: "Fichiers épinglés" }).getByRole("listitem")).toHaveCount(4);
});

test("archives, deletes, restores and permanently deletes", async ({ page }) => {
  await rowMenu(page, "Mot de bienvenue", "Archiver");
  await expect(toast(page)).toHaveText(/archivé/);
  await rowMenu(page, "Comment utiliser le Vault", "Supprimer");
  await dialog(page).getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect(row(page, "Comment utiliser le Vault")).toBeHidden();

  await sidebar(page).getByRole("button", { name: "Fichiers archivés" }).click();
  await expect(row(page, "Mot de bienvenue")).toBeVisible();
  await rowMenu(page, "Mot de bienvenue", "Restaurer");
  await expect(row(page, "Mot de bienvenue")).toBeHidden();

  await page.getByRole("tab", { name: /Supprimés/ }).click();
  await expect(rows(page)).toHaveCount(1);
  await rowMenu(page, "Comment utiliser le Vault", "Restaurer");
  await expect(rows(page)).toHaveCount(0);

  await go(page, "files");
  await rowMenu(page, "Comment utiliser le Vault", "Supprimer");
  await dialog(page).getByRole("button", { name: "Supprimer", exact: true }).click();
  await go(page, "archived");
  await page.getByRole("tab", { name: /Supprimés/ }).click();
  await rowMenu(page, "Comment utiliser le Vault", "Supprimer définitivement");
  await dialog(page).getByRole("button", { name: "Supprimer définitivement" }).click();
  await expect(toast(page)).toHaveText(/supprimé définitivement/);
  await expect(rows(page)).toHaveCount(0);
  await go(page, "files");
  await page.getByPlaceholder("Rechercher un fichier").fill("Comment utiliser");
  await expect(main(page).getByText("Aucun fichier ne correspond")).toBeVisible();
});

test("acts on several files at once", async ({ page }) => {
  await row(page, "Mot de bienvenue").getByRole("checkbox").click();
  await row(page, "Comment utiliser le Vault").getByRole("checkbox").click();
  const bar = page.getByRole("toolbar", { name: "Actions groupées" });
  await expect(bar).toContainText("2 sélectionnés");
  await bar.getByRole("button", { name: /Statut/ }).click();
  await page.getByRole("menuitem", { name: "En révision" }).click();
  await expect(row(page, "Mot de bienvenue")).toContainText("En révision");
  await expect(row(page, "Comment utiliser le Vault")).toContainText("En révision");
  await expect(bar).toBeHidden();

  await row(page, "Mot de bienvenue").getByRole("checkbox").click();
  await page.getByRole("toolbar", { name: "Actions groupées" }).getByRole("button", { name: /Archiver/ }).click();
  await expect(toast(page)).toHaveText(/archivé/);
  await expect(row(page, "Mot de bienvenue")).toBeHidden();
});

test("the command palette finds files, folders and projects", async ({ page }) => {
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Rechercher dans NDF Vault" });
  await palette.getByRole("textbox").fill("investisseurs");
  await expect(palette).toContainText("Présentation aux investisseurs.pptx");
  await palette.getByRole("textbox").fill("pb2");
  await expect(palette).toContainText("Production Blitz Two (PB2)");
  // The folder and the project share a name; the project is the one with its period under it.
  await palette.getByRole("button", { name: /Production Blitz Two \(PB2\).*2031/ }).click();
  await expect(page).toHaveURL(/#project-pb2$/);
  await expect(main(page).getByRole("heading", { name: "Production Blitz Two" })).toBeVisible();
});

test("opens a sample file in the viewer and moves between pages and files", async ({ page }) => {
  await row(page, "Mot de bienvenue").click();
  const viewer = dialog(page);
  await expect(viewer.getByRole("heading", { name: "Mot de bienvenue.pdf" })).toBeVisible();
  await expect(viewer).toContainText("Fichier d’exemple");
  const zoom = viewer.getByText(/^\d+ %$/);
  const before = await zoom.innerText();
  await viewer.getByRole("button", { name: "Zoom avant" }).click();
  await expect(zoom).not.toHaveText(before);
  await viewer.getByRole("button", { name: "Fichier suivant" }).click();
  await expect(viewer.getByRole("heading", { name: "Extrait du modèle prévisionnel.pdf" })).toBeVisible();
  await viewer.getByRole("button", { name: "Aller à la page 3" }).click();
  await expect(viewer.locator("[data-page-indicator]")).toHaveText("3 / 4");
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
});

test("unknown folders and projects get a clear message", async ({ page }) => {
  await go(page, "folder-nope");
  await expect(main(page).getByText("Dossier introuvable")).toBeVisible();
  await go(page, "project-nope");
  await expect(main(page).getByText("Projet introuvable")).toBeVisible();
});
