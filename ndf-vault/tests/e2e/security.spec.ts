import { expect, test } from "@playwright/test";
import { dialog, diskDump, downloaded, go, lockScreen, main, openVault, PASS, pdfFile, protect, row, rowMenu, tamperFirstOriginal, textFile, toast, unlock, upload } from "./helpers";

const SECRET = "Clause confidentielle numéro quarante-deux";

/** A vault holding a text file and a PDF whose names and content are recognizable on disk. */
async function seeded(page: import("@playwright/test").Page) {
  await openVault(page);
  await upload(page, [textFile("Entente secrète.txt", SECRET), await pdfFile("Plan financier.pdf", 2)], "legal");
}

test.describe("protection by passphrase", () => {
  test("only accepts a passphrase that is strong enough, confirmed and acknowledged", async ({ page }) => {
    await openVault(page, "preferences");
    await main(page).getByRole("button", { name: "Activer", exact: true }).click();
    const submit = dialog(page).locator("button[type=submit]");
    await page.fill("#protect-new", "court");
    await page.fill("#protect-confirm", "court");
    await page.check("#protect-understood");
    await expect(submit).toBeDisabled();
    await expect(dialog(page)).toContainText("Trop courte");
    await page.fill("#protect-new", "aaaaaaaaaaaaaaaa");
    await page.fill("#protect-confirm", "aaaaaaaaaaaaaaaa");
    await expect(submit).toBeDisabled();
    await page.fill("#protect-new", PASS);
    await page.fill("#protect-confirm", PASS + "x");
    await expect(dialog(page)).toContainText("Les deux saisies ne correspondent pas.");
    await expect(submit).toBeDisabled();
    await page.fill("#protect-confirm", PASS);
    await page.uncheck("#protect-understood");
    await expect(submit).toBeDisabled();
    await page.check("#protect-understood");
    await expect(submit).toBeEnabled();
  });

  test("leaves nothing readable on disk once the vault is protected", async ({ page }) => {
    await seeded(page);
    const before = await diskDump(page);
    expect(before).toContain(SECRET);
    expect(before).toContain("Entente secrète");

    await protect(page);
    const after = await diskDump(page);
    for (const leak of [SECRET, "Entente secrète", "Plan financier", "Scénario FS1", "Admin NDF5", PASS]) expect(after, leak).not.toContain(leak);
    // What stays in clear is only what is needed to ask for the passphrase.
    expect(after).toContain('"protected":true');
    expect(after).toContain('"wrapped"');

    // Files added afterwards are encrypted too.
    await go(page, "home");
    await upload(page, [textFile("Ajout.txt", "ajouté après la protection")], "legal");
    await expect(row(page, "Ajout")).toBeVisible();
    expect(await diskDump(page)).not.toContain("ajouté après la protection");
  });

  test("a locked vault shows nothing and slows down wrong guesses", async ({ page }) => {
    await seeded(page);
    await protect(page);
    await page.reload();
    await expect(lockScreen(page)).toBeVisible();
    // Nothing of the content is in the page while it is locked.
    const html = await page.content();
    for (const leak of ["Entente secrète", "Plan financier", "Scénario", SECRET]) expect(html, leak).not.toContain(leak);
    await expect(page.locator("#vault-main")).toHaveCount(0);

    for (const guess of ["mauvaise phrase", "encore fausse"]) {
      await page.fill("#unlock-passphrase", guess);
      await page.keyboard.press("Enter");
      await expect(page.getByRole("alert")).toHaveText("Phrase secrète incorrecte.");
    }
    await page.fill("#unlock-passphrase", "troisième erreur");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert")).toHaveText(/Trop de tentatives\. Réessayez dans \d+ s\./);
    await expect(page.getByRole("button", { name: "Déverrouiller" })).toBeDisabled();
    // Reloading does not reset the wait.
    await page.reload();
    await expect(page.getByRole("alert")).toHaveText(/Trop de tentatives/);

    await expect(page.getByRole("alert")).toHaveText(/3 tentatives échouées/, { timeout: 12_000 });
    await unlock(page);
    await expect(toast(page)).toHaveText("3 tentatives de déverrouillage échouées depuis votre dernière ouverture.");
    await go(page, "activity");
    await page.getByRole("tab", { name: /Sécurité/ }).click();
    await expect(main(page)).toContainText("a déverrouillé le Vault après 3 tentatives échouées");
    await expect(main(page)).toContainText("a activé la protection par phrase secrète");
  });

  test("gives everything back after unlocking: preview, download, versions", async ({ page }) => {
    await openVault(page);
    const plan = await pdfFile("Plan financier.pdf", 2);
    await upload(page, [textFile("Entente secrète.txt", SECRET), plan], "legal");
    await protect(page);
    await page.reload();
    await unlock(page);
    await go(page, "folder-legal");

    await row(page, "Entente secrète").click();
    await expect(dialog(page).locator("[data-viewer-canvas]")).toContainText(SECRET);
    await page.keyboard.press("Escape");
    await row(page, "Plan financier").click();
    await expect(dialog(page).locator("[data-page-indicator]")).toHaveText("1 / 2");
    await page.keyboard.press("Escape");

    const [download] = await Promise.all([page.waitForEvent("download"), row(page, "Plan financier").getByRole("button", { name: /^Télécharger / }).click()]);
    expect((await downloaded(download)).equals(plan.buffer)).toBe(true);

    await rowMenu(page, "Plan financier", "Historique des versions");
    await dialog(page).locator("#version-input").setInputFiles(await pdfFile("Plan financier.pdf", 3, "Révision"));
    await expect(dialog(page).getByRole("list", { name: "Versions" }).getByRole("listitem")).toHaveCount(2);
    expect(await diskDump(page)).not.toContain("Révision - page");
  });

  test("locks on demand", async ({ page }) => {
    await seeded(page);
    await protect(page);
    await page.getByRole("button", { name: "Verrouiller le Vault" }).click();
    await expect(lockScreen(page)).toBeVisible();
    await expect(page.locator("#vault-main")).toHaveCount(0);
    await unlock(page);
    await go(page, "folder-legal");
    await expect(row(page, "Entente secrète")).toBeVisible();
  });

  test("locks by itself after a period without activity", async ({ page }) => {
    await openVault(page);
    await protect(page);
    await expect(page.locator("#auto-lock")).toHaveValue("15");
    await page.clock.install();
    await page.clock.fastForward("14:00");
    await expect(page.locator("#vault-main")).toBeVisible();
    // Using the vault restarts the countdown.
    await page.mouse.move(400, 400);
    await page.mouse.move(420, 420);
    await page.clock.fastForward("14:00");
    await expect(lockScreen(page)).toHaveCount(0);
    await page.clock.fastForward("02:00");
    await expect(lockScreen(page)).toBeVisible({ timeout: 15_000 });
  });

  test("changes the passphrase: the old one stops working", async ({ page }) => {
    await seeded(page);
    await protect(page);
    const next = "girafe violette quarante-deux thé";
    await main(page).getByRole("button", { name: "Changer" }).click();
    await page.fill("#passphrase-current", "pas la bonne phrase");
    await page.fill("#passphrase-new", next);
    await page.fill("#passphrase-confirm", next);
    await dialog(page).locator("button[type=submit]").click();
    await expect(dialog(page)).toContainText("Phrase secrète actuelle incorrecte.");
    await page.fill("#passphrase-current", PASS);
    await dialog(page).locator("button[type=submit]").click();
    await expect(toast(page)).toHaveText("Phrase secrète changée");

    await page.reload();
    await page.fill("#unlock-passphrase", PASS);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert")).toHaveText("Phrase secrète incorrecte.");
    await unlock(page, next);
    await go(page, "folder-legal");
    await row(page, "Entente secrète").click();
    await expect(dialog(page).locator("[data-viewer-canvas]")).toContainText(SECRET);
  });

  test("can only be turned off with the passphrase", async ({ page }) => {
    await seeded(page);
    await protect(page);
    await main(page).getByRole("button", { name: "Désactiver" }).click();
    await page.fill("#unprotect-current", "pas la bonne phrase");
    await dialog(page).locator("button[type=submit]").click();
    await expect(dialog(page)).toContainText("Phrase secrète incorrecte.");
    expect(await diskDump(page)).not.toContain(SECRET);

    await page.fill("#unprotect-current", PASS);
    await dialog(page).locator("button[type=submit]").click();
    await expect(main(page).getByText("Désactivée", { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.reload();
    await expect(main(page)).toBeVisible();
    await expect(lockScreen(page)).toHaveCount(0);
    await go(page, "folder-legal");
    await expect(row(page, "Entente secrète")).toBeVisible();
  });

  test("without the passphrase or the recovery code, the only way out is erasing the vault", async ({ page }) => {
    await seeded(page);
    await protect(page);
    await page.reload();
    await page.getByRole("button", { name: "Phrase secrète oubliée ?" }).click();
    // The recovery code is offered first; erasing is what remains without it.
    await expect(page.locator("#recovery-code")).toBeVisible();
    await page.getByRole("button", { name: "Je n’ai pas ce code" }).click();
    const erase = page.getByRole("button", { name: "Effacer le Vault" });
    await expect(erase).toBeDisabled();
    await page.fill("#wipe-word", "effacer");
    await expect(erase).toBeDisabled();
    await page.fill("#wipe-word", "EFFACER");
    await erase.click();

    await expect(main(page)).toBeVisible();
    await go(page, "folder-legal");
    await expect(row(page, "Entente secrète")).toHaveCount(0);
    const dump = await diskDump(page);
    expect(dump).not.toContain('"protected":true');
    expect(dump).not.toContain(SECRET);
  });
});

test.describe("integrity of stored files", () => {
  test("a file altered on disk is detected, not shown and not downloadable", async ({ page }) => {
    await openVault(page);
    await upload(page, [await pdfFile("Contrat.pdf")], "legal");
    await tamperFirstOriginal(page);

    await row(page, "Contrat").click();
    await expect(dialog(page)).toContainText("Fichier altéré");
    await expect(dialog(page).locator("canvas")).toHaveCount(0);
    await expect(dialog(page).getByRole("button", { name: "Télécharger", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");

    let downloads = 0;
    page.on("download", () => downloads++);
    await row(page, "Contrat").getByRole("button", { name: /^Télécharger / }).click();
    await expect(toast(page)).toHaveText(/Ce fichier a été altéré/);
    expect(downloads).toBe(0);

    await rowMenu(page, "Contrat", "Modifier les détails");
    await dialog(page).getByRole("button", { name: "Vérifier" }).click();
    await expect(dialog(page)).toContainText("L’original ne correspond plus à cette empreinte.");
    await page.keyboard.press("Escape");

    await go(page, "activity");
    await page.getByRole("tab", { name: /Sécurité/ }).click();
    await expect(main(page)).toContainText("a détecté un fichier altéré : Contrat.pdf");
  });

  test("an intact file passes the check and shows its fingerprint", async ({ page }) => {
    await openVault(page);
    await upload(page, [await pdfFile("Contrat.pdf")], "legal");
    await rowMenu(page, "Contrat", "Modifier les détails");
    await expect(dialog(page).getByText(/^[0-9a-f]{64}$/)).toBeVisible();
    await dialog(page).getByRole("button", { name: "Vérifier" }).click();
    await expect(dialog(page)).toContainText("Intégrité vérifiée : l’original est intact.");
  });

  test("an encrypted file altered on disk is refused too", async ({ page }) => {
    await openVault(page);
    await upload(page, [textFile("Entente.txt", SECRET)], "legal");
    await protect(page);
    await tamperFirstOriginal(page);
    await go(page, "folder-legal");
    await row(page, "Entente").click();
    await expect(dialog(page)).toContainText("Fichier altéré");
    await expect(dialog(page).locator("[data-viewer-canvas]")).not.toContainText(SECRET);
  });
});

test.describe("hostile input", () => {
  test("markup typed into names, tags, notes and the profile stays inert text", async ({ page }) => {
    await openVault(page, "files");
    const attack = '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>';

    await rowMenu(page, "Mot de bienvenue", "Renommer");
    await page.fill("#file-name", attack + " fichier");
    await page.keyboard.press("Enter");
    await rowMenu(page, "fichier", "Modifier les détails");
    await dialog(page).getByPlaceholder("scénario, FS1").fill(attack);
    await dialog(page).getByPlaceholder("Ajoutez une note pour vos collaborateurs").fill(attack);
    await dialog(page).locator("button[type=submit]").click();

    await main(page).getByRole("button", { name: "Ajouter", exact: true }).click();
    await page.getByRole("menuitem", { name: "Nouveau dossier" }).click();
    await page.fill("#new-folder-name", attack + " dossier");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#folder-d-/);

    await go(page, "projects");
    await main(page).getByRole("button", { name: "Nouveau projet" }).click();
    await page.fill("#new-project-name", attack + " projet");
    await page.keyboard.press("Enter");

    await go(page, "preferences");
    await page.fill("#profile-name", attack);
    await page.fill("#profile-company", attack);
    await main(page).getByRole("button", { name: "Enregistrer le profil" }).click();

    // Visit every place those values are shown.
    for (const view of ["files", "home", "activity", "projects", "preferences", "folder-root"]) {
      await go(page, view);
      await expect(main(page)).toBeVisible();
    }
    await go(page, "files");
    await row(page, "fichier").click();
    await expect(dialog(page).locator("[data-personal-watermark]").first()).toBeAttached();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+k");
    await page.getByRole("dialog").getByRole("textbox").fill("fichier");
    await expect(page.getByRole("dialog")).toContainText("fichier.pdf");

    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    await expect(page.locator("#vault-root script, #vault-root iframe")).toHaveCount(0);
  });

  test("a hostile file name is cleaned when the file is uploaded", async ({ page }) => {
    await openVault(page);
    await upload(page, [textFile('<img src=x onerror="window.__xss=1">‮fdp.txt', "contenu")], "legal");
    // No markup characters and no text-direction override are left in the stored name.
    const name = await row(page, "onerror").locator("td").nth(1).locator("button").first().innerText();
    expect(name).not.toMatch(/[<>"‮]/);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
  });

  test("a name cannot carry a path", async ({ page }) => {
    await openVault(page, "files");
    await rowMenu(page, "Mot de bienvenue", "Renommer");
    await page.fill("#file-name", "../../etc/passwd");
    await page.keyboard.press("Enter");
    await expect(row(page, "etc-passwd")).toBeVisible();
    const name = await row(page, "etc-passwd").locator("td").nth(1).locator("button").first().innerText();
    expect(name).not.toMatch(/[\\/]/);
    expect(name.startsWith(".")).toBe(false);
  });

  test("the journal export cannot smuggle a spreadsheet formula", async ({ page }) => {
    await openVault(page, "files");
    await rowMenu(page, "Mot de bienvenue", "Renommer");
    await page.fill("#file-name", "=HYPERLINK(evil,clic)");
    await page.keyboard.press("Enter");
    await expect(toast(page)).toHaveText(/Fichier renommé/);
    await go(page, "activity");
    const [download] = await Promise.all([page.waitForEvent("download"), main(page).getByRole("button", { name: "Exporter (CSV)" }).click()]);
    const text = (await downloaded(download)).toString("utf8");
    expect(text).toContain("'=HYPERLINK(evil,clic).pdf");
    // No cell of the file starts with a character a spreadsheet would execute.
    for (const line of text.slice(1).split("\r\n")) for (const cell of line.split(",")) expect(cell.replace(/^"/, "")).not.toMatch(/^[=+@]/);
  });
});
