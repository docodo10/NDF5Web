import { expect, test } from "@playwright/test";
import { dialog, diskDump, downloaded, go, main, openVault, PASS, pdfFile, protect, row, rows, textFile, toast, unlock, upload } from "./helpers";

type Page = import("@playwright/test").Page;

const SECRET = "Clause confidentielle numéro quarante-deux";
const BACKUP_PASS = "valise horloge sentier cuivre";

/** A vault with two uploaded files, one of them with an earlier version, a new folder and an edited profile. */
async function seeded(page: Page) {
  await openVault(page);
  await upload(page, [textFile("Entente secrète.txt", SECRET), await pdfFile("Plan financier.pdf", 2)], "legal");
}

/** Create a backup through the dialog and return the downloaded file. */
async function backup(page: Page, passphrase = BACKUP_PASS): Promise<Buffer> {
  await go(page, "preferences");
  await main(page).getByRole("button", { name: "Sauvegarder" }).last().click();
  await page.fill("#backup-new", passphrase);
  await page.fill("#backup-confirm", passphrase);
  const [download] = await Promise.all([page.waitForEvent("download"), dialog(page).locator("button[type=submit]").click()]);
  expect(download.suggestedFilename()).toMatch(/^ndf-vault-\d{4}-\d{2}-\d{2}\.ndfvault$/);
  await expect(dialog(page)).toBeHidden();
  return downloaded(download);
}

/** Pick a backup file in the restore dialog and fill the form, without sending it. */
async function chooseBackup(page: Page, file: Buffer, passphrase: string, name = "ndf-vault.ndfvault") {
  await go(page, "preferences");
  await main(page).getByRole("button", { name: "Restaurer" }).click();
  await dialog(page).locator("#restore-file").setInputFiles({ name, mimeType: "application/octet-stream", buffer: file });
  await page.fill("#restore-passphrase", passphrase);
}

test.describe("encrypted backup", () => {
  test("holds the whole vault and shows nothing of it without the passphrase", async ({ page }) => {
    await seeded(page);
    const file = await backup(page);
    const raw = file.toString("latin1");
    expect(raw.startsWith("NDFVAULT-BACKUP\n")).toBe(true);
    for (const leak of [SECRET, "Entente", "Plan financier", "Juridique", "Admin NDF5", "%PDF", BACKUP_PASS]) expect(raw, leak).not.toContain(leak);
    await expect(toast(page)).toContainText("Sauvegarde créée : 2 originaux");
    await go(page, "activity");
    await main(page).getByRole("tab", { name: /Sécurité/ }).click();
    await expect(main(page)).toContainText("a créé une sauvegarde chiffrée");
  });

  test("asks for a real passphrase, typed twice", async ({ page }) => {
    await seeded(page);
    await go(page, "preferences");
    await main(page).getByRole("button", { name: "Sauvegarder" }).last().click();
    const submit = dialog(page).locator("button[type=submit]");
    await page.fill("#backup-new", "court");
    await page.fill("#backup-confirm", "court");
    await expect(submit).toBeDisabled();
    await page.fill("#backup-new", BACKUP_PASS);
    await page.fill("#backup-confirm", `${BACKUP_PASS}x`);
    await expect(dialog(page)).toContainText("Les deux saisies ne correspondent pas.");
    await expect(submit).toBeDisabled();
    await page.fill("#backup-confirm", BACKUP_PASS);
    await expect(submit).toBeEnabled();
  });

  test("restores everything on a device that has never seen the vault", async ({ page, browser }) => {
    await seeded(page);
    // Something to recognize besides the files: a new version, a folder, the profile.
    await go(page, "folder-legal");
    await row(page, "Entente secrète").getByRole("button", { name: /^Actions pour/ }).click();
    await page.getByRole("menuitem", { name: "Historique des versions", exact: true }).click();
    await dialog(page).locator("#version-input").setInputFiles(textFile("Entente secrète.txt", "Deuxième version de l’entente"));
    await expect(dialog(page).getByRole("list", { name: "Versions" }).getByRole("listitem")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await go(page, "preferences");
    await page.fill("#profile-company", "Société de test");
    await main(page).getByRole("button", { name: "Enregistrer le profil" }).click();
    const file = await backup(page);

    // A second browser profile: another device.
    const other = await browser.newContext({ locale: "fr-CA", viewport: { width: 1440, height: 900 } });
    const fresh = await other.newPage();
    await openVault(fresh);
    await go(fresh, "folder-legal");
    await expect(row(fresh, "Entente secrète")).toHaveCount(0);

    await chooseBackup(fresh, file, BACKUP_PASS);
    await expect(dialog(fresh)).toContainText(/Sauvegarde du \d/);
    const submit = dialog(fresh).locator("button[type=submit]");
    // Replacing a vault takes an explicit yes.
    await expect(submit).toBeDisabled();
    await fresh.check("#restore-understood");
    await submit.click();
    await expect(toast(fresh)).toContainText(/Sauvegarde du .+ restaurée\./, { timeout: 20_000 });

    await go(fresh, "folder-legal");
    await row(fresh, "Entente secrète").click();
    await expect(dialog(fresh).locator("[data-viewer-canvas]")).toContainText("Deuxième version de l’entente");
    await fresh.keyboard.press("Escape");
    await row(fresh, "Plan financier").click();
    await expect(dialog(fresh).locator("[data-page-indicator]")).toHaveText("1 / 2");
    await fresh.keyboard.press("Escape");
    // The earlier version came along, with its original.
    await row(fresh, "Entente secrète").getByRole("button", { name: /^Actions pour/ }).click();
    await fresh.getByRole("menuitem", { name: "Historique des versions", exact: true }).click();
    const versions = dialog(fresh).getByRole("list", { name: "Versions" }).getByRole("listitem");
    await expect(versions).toHaveCount(2);
    const [old] = await Promise.all([fresh.waitForEvent("download"), versions.nth(1).getByRole("button", { name: /Télécharger/ }).click()]);
    expect((await downloaded(old)).toString("utf8")).toBe(SECRET);
    await fresh.keyboard.press("Escape");
    await go(fresh, "preferences");
    await expect(fresh.locator("#profile-company")).toHaveValue("Société de test");
    // It survives a reload: the restored vault is what is stored now.
    await fresh.reload();
    await go(fresh, "folder-legal");
    await expect(row(fresh, "Entente secrète")).toBeVisible();
    await go(fresh, "activity");
    await main(fresh).getByRole("tab", { name: /Sécurité/ }).click();
    await expect(main(fresh)).toContainText("a restauré la sauvegarde du");
    await other.close();
  });

  test("refuses a wrong passphrase, a damaged file and a file that is not a backup, and replaces nothing", async ({ page }) => {
    await seeded(page);
    const file = await backup(page);
    await go(page, "home");
    await upload(page, [textFile("Ajout récent.txt", "ajouté après la sauvegarde")], "legal");

    await chooseBackup(page, file, "pas la bonne phrase");
    await page.check("#restore-understood");
    const submit = dialog(page).locator("button[type=submit]");
    await submit.click();
    await expect(dialog(page)).toContainText("Phrase secrète incorrecte.");

    // One flipped bit near the end: the passphrase is right, the content is not what was sealed.
    const damaged = Buffer.from(file);
    damaged[damaged.length - 20] ^= 1;
    await dialog(page).locator("#restore-file").setInputFiles({ name: "abimee.ndfvault", mimeType: "application/octet-stream", buffer: damaged });
    await page.fill("#restore-passphrase", BACKUP_PASS);
    await submit.click();
    await expect(dialog(page)).toContainText("endommagée ou a été modifiée : rien n’a été remplacé.");

    await dialog(page).locator("#restore-file").setInputFiles({ name: "document.ndfvault", mimeType: "application/octet-stream", buffer: Buffer.from("%PDF-1.7 un document ordinaire") });
    await expect(dialog(page)).toContainText("Ce fichier n’est pas une sauvegarde NDF Vault.");
    await expect(submit).toBeDisabled();
    await page.keyboard.press("Escape");

    // Nothing was touched: the file added after the backup is still there.
    await go(page, "folder-legal");
    await expect(row(page, "Ajout récent")).toBeVisible();
    await expect(rows(page).filter({ hasText: "Entente secrète" })).toHaveCount(1);
  });

  test("restores into a protected vault and stores it encrypted", async ({ page }) => {
    await seeded(page);
    const file = await backup(page);
    // Start over, protect the empty vault, then restore into it.
    await main(page).getByRole("button", { name: "Réinitialiser" }).click();
    await dialog(page).locator("button[type=submit]").click();
    // The reset ends by going back to the home page: wait for it before going anywhere else.
    await expect(toast(page)).toContainText("Vault réinitialisé");
    await protect(page);
    await chooseBackup(page, file, BACKUP_PASS);
    await page.check("#restore-understood");
    // Replacing a protected vault also takes its own passphrase.
    const submit = dialog(page).locator("button[type=submit]");
    await expect(submit).toBeDisabled();
    await page.fill("#restore-own-passphrase", "pas la phrase du Vault");
    await submit.click();
    await expect(dialog(page)).toContainText("Phrase secrète du Vault incorrecte.");
    await page.fill("#restore-own-passphrase", PASS);
    await submit.click();
    await expect(toast(page)).toContainText("restaurée", { timeout: 20_000 });

    const dump = await diskDump(page);
    for (const leak of [SECRET, "Entente secrète", "Plan financier"]) expect(dump, leak).not.toContain(leak);
    expect(dump).toContain('"protected":true');
    // The vault's own passphrase is unchanged by the restore.
    await page.reload();
    await unlock(page);
    await go(page, "folder-legal");
    await row(page, "Entente secrète").click();
    await expect(dialog(page).locator("[data-viewer-canvas]")).toContainText(SECRET);
  });
});
