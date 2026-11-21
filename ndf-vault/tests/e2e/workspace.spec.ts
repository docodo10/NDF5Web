import { expect, test } from "@playwright/test";
import { dialog, docxFile, go, main, openVault, pngFile, row, rowMenu, textFile, toast, upload } from "./helpers";
import { para, zipBuffer } from "../fixtures/office";

type Page = import("@playwright/test").Page;

const panel = (page: Page) => page.getByRole("complementary", { name: "Informations sur le fichier" });
const bell = (page: Page) => page.getByRole("button", { name: /^Notifications/ });
const notices = (page: Page) => page.getByRole("menu", { name: "Notifications" });

/** A calendar date some days from today, as a date input wants it. */
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function seeded(page: Page) {
  await openVault(page);
  await upload(page, [textFile("Option d’achat.txt", "Le prix est de 100 dollars.")], "legal");
}

async function addVersion(page: Page, name: string, file: ReturnType<typeof textFile>) {
  await rowMenu(page, name, "Historique des versions");
  await dialog(page).locator("#version-input").setInputFiles(file);
  await expect(dialog(page).getByRole("list", { name: "Versions" }).getByRole("listitem")).toHaveCount(2);
}

test.describe("information panel", () => {
  test("gathers what there is to know about a file, and closes like a panel should", async ({ page }) => {
    await seeded(page);
    await rowMenu(page, "Option d’achat", "Informations");
    const p = panel(page);
    await expect(p.getByRole("heading", { name: "Option d’achat.txt" })).toBeVisible();
    await expect(p).toContainText("Juridique et chaîne de titres");
    await expect(p).toContainText("Standard");
    await expect(p.getByText(/^[0-9a-f]{16}…$/)).toBeVisible();
    await expect(p.getByRole("list", { name: "Activité du fichier" })).toContainText("a téléversé");
    // Opening the file from the panel leaves the panel where it was.
    await p.getByRole("button", { name: "Ouvrir" }).click();
    await expect(dialog(page).locator("[data-viewer-canvas]")).toContainText("Le prix est de 100 dollars.");
    await page.keyboard.press("Escape");
    await expect(p).toBeVisible();
    await expect(p.getByRole("list", { name: "Activité du fichier" })).toContainText("a ouvert");
    await page.keyboard.press("Escape");
    await expect(p).toHaveCount(0);
    // The link to its folder goes there.
    await go(page, "home");
    await rowMenu(page, "Option d’achat", "Informations");
    await panel(page).getByRole("button", { name: "Juridique et chaîne de titres" }).click();
    await expect(page).toHaveURL(/#folder-legal$/);
    await expect(panel(page)).toHaveCount(0);
  });

  test("goes away with its file", async ({ page }) => {
    await seeded(page);
    await rowMenu(page, "Option d’achat", "Informations");
    await expect(panel(page)).toBeVisible();
    await rowMenu(page, "Option d’achat", "Supprimer");
    await dialog(page).locator("button[type=submit]").click();
    await go(page, "archived");
    await main(page).getByRole("tab", { name: /Supprimés/ }).click();
    await row(page, "Option d’achat").getByRole("checkbox").click();
    await page.getByRole("toolbar", { name: "Actions groupées" }).getByRole("button", { name: /Supprimer définitivement/ }).click();
    await dialog(page).locator("button[type=submit]").click();
    await expect(panel(page)).toHaveCount(0);
  });
});

test.describe("comments", () => {
  test("are kept with the file, shown as written, and can be removed", async ({ page }) => {
    await seeded(page);
    await rowMenu(page, "Option d’achat", "Informations");
    const p = panel(page);
    await expect(p).toContainText("Aucun commentaire.");
    const publish = p.getByRole("button", { name: "Publier" });
    await expect(publish).toBeDisabled();
    await page.fill("#comment-text", "À renouveler avant décembre.\nVoir avec <b>le service juridique</b> & <img src=x onerror=alert(1)>");
    await publish.click();
    const list = p.getByRole("list", { name: "Commentaires" });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list).toContainText("Admin NDF5");
    await expect(list).toContainText("Voir avec <b>le service juridique</b> & <img src=x onerror=alert(1)>");
    expect(await list.locator("b, img").count()).toBe(0);
    await expect(page.locator("#comment-text")).toHaveValue("");
    await page.fill("#comment-text", "Deuxième note.");
    await publish.click();
    await expect(p.getByRole("heading", { name: "Commentaires (2)" })).toBeVisible();

    await page.reload();
    await rowMenu(page, "Option d’achat", "Informations");
    await expect(panel(page).getByRole("list", { name: "Commentaires" }).getByRole("listitem")).toHaveCount(2);
    await panel(page).getByRole("button", { name: "Supprimer ce commentaire" }).first().click();
    await expect(panel(page).getByRole("list", { name: "Commentaires" }).getByRole("listitem")).toHaveCount(1);
    await expect(panel(page).getByRole("list", { name: "Commentaires" })).toContainText("Deuxième note.");
    await expect(panel(page).getByRole("list", { name: "Activité du fichier" })).toContainText("a commenté");
  });
});

test.describe("due dates", () => {
  test("show how close they are everywhere the file appears, and ring the bell", async ({ page }) => {
    await seeded(page);
    await rowMenu(page, "Option d’achat", "Informations");
    const p = panel(page);
    const set = p.getByRole("button", { name: /Fixer l’échéance|Mettre à jour/ });
    await expect(set).toBeDisabled();
    await page.fill("#due-date", day(12));
    await page.fill("#due-label", "Expiration de l’option");
    await set.click();
    await expect(toast(page)).toContainText("Échéance fixée au");
    await expect(p.locator("[data-due=soon]")).toHaveText("Dans 12 jours");
    await expect(p).toContainText("Expiration de l’option ·");
    await page.keyboard.press("Escape");

    // In the table, on the home page, and in the bell.
    await expect(row(page, "Option d’achat").locator("[data-due=soon]")).toHaveText("Dans 12 jours");
    await go(page, "home");
    const section = main(page).getByRole("region", { name: "Échéances" });
    await expect(section).toContainText("Option d’achat");
    await expect(section).toContainText("Expiration de l’option");
    await bell(page).click();
    const notice = notices(page).getByRole("menuitem").filter({ hasText: "Expiration de l’option — Option d’achat.txt" });
    await expect(notice).toContainText("Échéance : dans 12 jours");
    await notice.click();
    await expect(panel(page).getByRole("heading", { name: "Option d’achat.txt" })).toBeVisible();

    // Past its date, it turns red and moves to the top of the bell.
    await page.fill("#due-date", day(-3));
    await panel(page).getByRole("button", { name: "Mettre à jour" }).click();
    await expect(panel(page).locator("[data-due=overdue]")).toHaveText("Échue depuis 3 jours");
    await bell(page).click();
    await expect(notices(page).getByRole("menuitem").first()).toContainText("Échue depuis 3 jours");
    await page.keyboard.press("Escape");

    // It survives a reload, and can be removed.
    await page.reload();
    await expect(main(page).getByRole("region", { name: "Échéances" }).locator("[data-due=overdue]")).toBeVisible();
    await main(page).getByRole("region", { name: "Échéances" }).getByRole("button", { name: /Option d’achat/ }).click();
    await panel(page).getByRole("button", { name: "Retirer" }).click();
    await expect(toast(page)).toContainText("Échéance retirée");
    await expect(panel(page).locator("[data-due]")).toHaveCount(0);
    await expect(main(page).getByRole("region", { name: "Échéances" })).toHaveCount(0);
  });

  test("a date far ahead is noted without raising anything", async ({ page }) => {
    await seeded(page);
    await rowMenu(page, "Option d’achat", "Informations");
    await page.fill("#due-date", day(200));
    await panel(page).getByRole("button", { name: "Fixer l’échéance" }).click();
    await expect(panel(page).locator("[data-due=later]")).toHaveText("Dans 200 jours");
    await page.keyboard.press("Escape");
    await go(page, "home");
    await expect(main(page).getByRole("region", { name: "Échéances" })).toHaveCount(0);
    await bell(page).click();
    await expect(notices(page).getByRole("menuitem").filter({ hasText: "Option d’achat" })).toHaveCount(0);
  });
});

test.describe("notifications", () => {
  test("have nothing to say about an untouched vault, and speak up once there is something to protect", async ({ page }) => {
    await openVault(page);
    await expect(page.locator("[data-notice-count]")).toHaveCount(0);
    await bell(page).click();
    await expect(notices(page)).toContainText("Rien à signaler");
    await notices(page).getByRole("menuitem", { name: "Voir toute l’activité" }).click();
    await expect(page).toHaveURL(/#activity$/);

    await go(page, "home");
    await upload(page, [textFile("Mandat.txt", "contenu")], "legal");
    await expect(page.locator("[data-notice-count]")).toHaveText("2");
    await bell(page).click();
    await expect(notices(page).getByRole("menuitem").filter({ hasText: "Aucune sauvegarde chiffrée" })).toBeVisible();
    // Each notice leads to what settles it.
    await notices(page).getByRole("menuitem").filter({ hasText: "Le Vault n’est pas protégé" }).click();
    await expect(page.getByRole("dialog", { name: "Protéger le Vault" })).toBeVisible();
  });
});

test.describe("comparing versions", () => {
  test("shows what was added and what was removed between a version and the current one", async ({ page }) => {
    await seeded(page);
    await addVersion(page, "Option d’achat", textFile("Option d’achat.txt", "Le prix est de 250 dollars, payable à la signature."));
    await dialog(page).getByRole("button", { name: "Comparer" }).click();
    const compare = page.getByRole("dialog", { name: "Comparer les versions" });
    const view = compare.locator("[data-compare]");
    // "250", "payable", "à", "la", "signature" came in; "100" went out.
    await expect(view.locator("[data-added]")).toContainText("5 mots ajoutés");
    await expect(view.locator("[data-removed]")).toContainText("1 mot retiré");
    await expect(view.locator("del")).toHaveText(["100"]);
    await expect(view.locator("ins").first()).toHaveText("250");
    await expect(view).toContainText("Le prix est de 100250 dollars, payable à la signature.");
    // Back to the list it came from.
    await compare.getByRole("button", { name: "Retour aux versions" }).click();
    await expect(page.getByRole("dialog").getByRole("list", { name: "Versions" })).toBeVisible();
  });

  test("works on Word documents, and says so when the text has not changed", async ({ page }) => {
    await openVault(page);
    await upload(page, [docxFile("Entente.docx", para("Les décors seront livrés à Montréal."))], "legal");
    await rowMenu(page, "Entente", "Historique des versions");
    // Same text, restyled: a different file, the same words.
    await dialog(page).locator("#version-input").setInputFiles(docxFile("Entente.docx", para("Les décors seront livrés à Montréal.", { props: "<w:b/>" })));
    await expect(dialog(page).getByRole("list", { name: "Versions" }).getByRole("listitem")).toHaveCount(2);
    await dialog(page).getByRole("button", { name: "Comparer" }).click();
    await expect(page.getByRole("dialog", { name: "Comparer les versions" })).toContainText("Le texte est identique dans les deux versions.");
    await page.keyboard.press("Escape");

    await rowMenu(page, "Entente", "Historique des versions");
    await dialog(page).locator("#version-input").setInputFiles(docxFile("Entente.docx", para("Les décors seront livrés à Québec avant le tournage.")));
    await expect(dialog(page).getByRole("list", { name: "Versions" }).getByRole("listitem")).toHaveCount(3);
    await dialog(page).getByRole("button", { name: "Comparer" }).first().click();
    const view = page.getByRole("dialog", { name: "Comparer les versions" }).locator("[data-compare]");
    await expect(view.locator("del")).toHaveText(["Montréal"]);
    await expect(view.locator("ins").first()).toContainText("Québec");
  });

  test("is not offered for images, which have no text", async ({ page }) => {
    await openVault(page);
    await upload(page, [pngFile("Affiche.png", 320, 200)], "legal");
    await rowMenu(page, "Affiche", "Historique des versions");
    await dialog(page).locator("#version-input").setInputFiles(pngFile("Affiche.png", 320, 200, [20, 80, 160]));
    await expect(dialog(page).getByRole("list", { name: "Versions" }).getByRole("listitem")).toHaveCount(2);
    await expect(dialog(page).getByRole("button", { name: "Comparer" })).toHaveCount(0);
  });
});

test.describe("importing an archive", () => {
  const archive = (name = "Dossier.zip") => ({
    name,
    mimeType: "application/zip",
    buffer: zipBuffer([
      { name: "Contrats/Entente.txt", data: "texte de l’entente" },
      { name: "Contrats/Annexes/Annexe A.txt", data: "première annexe" },
      { name: "__MACOSX/Contrats/._Entente.txt", data: "bruit" },
      { name: "Contrats/programme.exe", data: Buffer.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]) },
      { name: "../../hors-du-dossier.txt", data: "tentative de sortie" },
    ]),
  });

  test("unpacks it into its folders, with every file checked like any other", async ({ page }) => {
    await openVault(page, "folder-legal");
    await main(page).getByRole("button", { name: "Actions du dossier" }).click();
    await expect(page.getByRole("menuitem", { name: "Importer une archive ZIP" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.locator("[data-zip-input]").first().setInputFiles(archive());
    const d = page.getByRole("dialog", { name: "Téléverser des fichiers" });
    const list = d.getByRole("list", { name: "Fichiers choisis" });
    await expect(list.getByRole("listitem")).toHaveCount(4);
    await expect(list).toContainText("Contrats / Annexes / Annexe A.txt");
    // What the archive carried for itself is gone; what should not be accepted is refused, with the reason.
    await expect(list).not.toContainText("._Entente");
    await expect(list.getByRole("listitem").filter({ hasText: "programme.exe" })).toContainText("Le format .exe n’est pas accepté.");
    await expect(d.locator("#upload-folder")).toHaveValue("legal");
    await d.locator("button[type=submit]").click();
    await expect(toast(page)).toContainText("3 fichiers téléversés");

    // A path that tried to climb out landed inside the destination.
    await expect(row(page, "hors-du-dossier")).toBeVisible();
    await main(page).getByRole("button", { name: /Contrats/ }).click();
    await expect(row(page, "Entente")).toBeVisible();
    await main(page).getByRole("button", { name: /Annexes/ }).click();
    await row(page, "Annexe A").click();
    await expect(dialog(page).locator("[data-viewer-canvas]")).toContainText("première annexe");
  });

  test("is offered in the add menu, and refuses what is not an archive", async ({ page }) => {
    await openVault(page, "files");
    await main(page).getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Importer une archive ZIP" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.locator("[data-zip-input]").first().setInputFiles({ name: "faux.zip", mimeType: "application/zip", buffer: Buffer.from("ceci n’est pas une archive") });
    await expect(toast(page)).toContainText("Ce fichier n’est pas une archive ZIP lisible.");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator("[data-zip-input]").first().setInputFiles({ name: "vide.zip", mimeType: "application/zip", buffer: zipBuffer([{ name: "__MACOSX/._x", data: "bruit" }]) });
    await expect(toast(page)).toContainText("Cette archive ne contient aucun fichier.");
  });
});
