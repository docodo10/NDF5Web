import { expect, test } from "@playwright/test";
import { dialog, diskDump, downloaded, go, lockScreen, main, noteRecoveryCode, openVault, PASS, protect, row, textFile, toast, unlock, upload } from "./helpers";

const SECRET = "Clause confidentielle numéro quarante-deux";
const NEXT = "parapluie violon marée cabane";

async function seeded(page: import("@playwright/test").Page) {
  await openVault(page);
  await upload(page, [textFile("Entente secrète.txt", SECRET)], "legal");
}

/** Forget the passphrase on the lock screen and type a recovery code and a new passphrase. */
async function recoverWith(page: import("@playwright/test").Page, code: string, passphrase = NEXT) {
  await page.getByRole("button", { name: "Phrase secrète oubliée ?" }).click();
  await page.fill("#recovery-code", code);
  await page.fill("#recovery-new", passphrase);
  await page.fill("#recovery-confirm", passphrase);
  await page.getByRole("button", { name: "Enregistrer la nouvelle phrase" }).click();
}

test.describe("recovery code", () => {
  test("is handed out when protection is turned on, and never stored in clear", async ({ page }) => {
    await seeded(page);
    const code = await protect(page);
    expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
    const dump = await diskDump(page);
    expect(dump).not.toContain(code);
    expect(dump).not.toContain(code.replace(/-/g, ""));
    expect(dump).toContain('"recovery"');
    // Settings say a code exists, and the journal recorded it.
    await expect(main(page).getByRole("button", { name: "Remplacer le code" })).toBeVisible();
    await go(page, "activity");
    await main(page).getByRole("tab", { name: /Sécurité/ }).click();
    await expect(main(page)).toContainText("a créé un code de récupération");
  });

  test("cannot be skipped past without confirming it was written down", async ({ page }) => {
    await seeded(page);
    await go(page, "preferences");
    await main(page).getByRole("button", { name: "Activer", exact: true }).last().click();
    await page.fill("#protect-new", PASS);
    await page.fill("#protect-confirm", PASS);
    await page.check("#protect-understood");
    await dialog(page).locator("button[type=submit]").click();
    await expect(page.locator("[data-recovery-code]")).toBeVisible({ timeout: 20_000 });
    await expect(dialog(page).getByRole("button", { name: "Terminer" })).toBeDisabled();
    // The code can be kept as a file.
    const [download] = await Promise.all([page.waitForEvent("download"), dialog(page).getByRole("button", { name: "Enregistrer (.txt)" }).click()]);
    expect(download.suggestedFilename()).toBe("code-de-recuperation-ndf-vault.txt");
    expect((await downloaded(download)).toString("utf8")).toContain(await page.locator("[data-recovery-code]").innerText());
    await page.check("#recovery-noted");
    await expect(dialog(page).getByRole("button", { name: "Terminer" })).toBeEnabled();
  });

  test("gets a forgotten vault back with a new passphrase, and is replaced once used", async ({ page }) => {
    await seeded(page);
    const code = await protect(page);
    await page.reload();
    await expect(lockScreen(page)).toBeVisible();

    // Typed the way a person copies it back: lower case, spaces instead of dashes.
    await recoverWith(page, code.toLowerCase().replace(/-/g, " "));
    await expect(page.getByRole("heading", { name: "Nouvelle phrase secrète enregistrée" })).toBeVisible({ timeout: 20_000 });
    const open = page.getByRole("button", { name: "Ouvrir le Vault" });
    await expect(open).toBeDisabled();
    const replacement = await noteRecoveryCode(page);
    expect(replacement).not.toBe(code);
    await open.click();

    // The documents are all there, readable, under the new passphrase.
    await expect(main(page)).toBeVisible({ timeout: 20_000 });
    await go(page, "folder-legal");
    await row(page, "Entente secrète").click();
    await expect(dialog(page).locator("[data-viewer-canvas]")).toContainText(SECRET);
    await page.keyboard.press("Escape");
    await go(page, "activity");
    await main(page).getByRole("tab", { name: /Sécurité/ }).click();
    await expect(main(page)).toContainText("a choisi une nouvelle phrase secrète avec le code de récupération");

    // The old passphrase and the old code are dead; the new ones work.
    await page.reload();
    await page.fill("#unlock-passphrase", PASS);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert")).toContainText("Phrase secrète incorrecte.");
    await recoverWith(page, code, "troisième phrase à retenir");
    await expect(page.getByRole("alert").first()).toContainText("Code de récupération incorrect.");
    await page.getByRole("button", { name: "Retour" }).click();
    await unlock(page, NEXT);
    await expect(toast(page)).toContainText("tentatives de déverrouillage échouées");
  });

  test("refuses a wrong code, slows down guesses, and leaves the vault intact", async ({ page }) => {
    await seeded(page);
    await protect(page);
    await page.reload();
    await page.getByRole("button", { name: "Phrase secrète oubliée ?" }).click();
    const submit = page.getByRole("button", { name: "Enregistrer la nouvelle phrase" });
    await page.fill("#recovery-new", NEXT);
    await page.fill("#recovery-confirm", NEXT);
    // Not a code at all: nothing to send.
    await page.fill("#recovery-code", "pas un code");
    await expect(submit).toBeDisabled();
    await expect(page.getByText("Le code compte 24 caractères")).toBeVisible();
    for (let i = 0; i < 3; i++) {
      await page.fill("#recovery-code", `0000-0000-0000-0000-0000-000${i}`);
      await expect(submit).toBeEnabled({ timeout: 15_000 });
      await submit.click();
      await expect(page.getByRole("alert").first()).toContainText(i < 2 ? "Code de récupération incorrect." : "Trop de tentatives");
    }
    await expect(submit).toBeDisabled();
    // The real passphrase still opens it, and the journal knows about the attempts.
    await page.getByRole("button", { name: "Retour" }).click();
    await page.fill("#unlock-passphrase", PASS);
    await expect(page.getByRole("button", { name: "Déverrouiller" })).toBeEnabled({ timeout: 15_000 });
    await page.keyboard.press("Enter");
    await expect(main(page)).toBeVisible({ timeout: 20_000 });
    await expect(toast(page)).toContainText("3 tentatives de déverrouillage échouées");
  });

  test("can be replaced from the settings, with the passphrase", async ({ page }) => {
    await seeded(page);
    const first = await protect(page);
    await main(page).getByRole("button", { name: "Remplacer le code" }).click();
    await page.fill("#recovery-current", "pas la bonne phrase");
    await dialog(page).locator("button[type=submit]").click();
    await expect(dialog(page)).toContainText("Phrase secrète incorrecte.");
    await page.fill("#recovery-current", PASS);
    await dialog(page).locator("button[type=submit]").click();
    const second = await noteRecoveryCode(page);
    expect(second).not.toBe(first);
    await dialog(page).getByRole("button", { name: "Terminer" }).click();

    await page.reload();
    await recoverWith(page, first);
    await expect(page.getByRole("alert").first()).toContainText("Code de récupération incorrect.");
    await page.fill("#recovery-code", second);
    await page.getByRole("button", { name: "Enregistrer la nouvelle phrase" }).click();
    await expect(page.getByRole("heading", { name: "Nouvelle phrase secrète enregistrée" })).toBeVisible({ timeout: 20_000 });
  });

  test("a vault protected before recovery codes existed says so and can create one", async ({ page }) => {
    await seeded(page);
    await protect(page);
    // Remove the code from what is stored, as in a vault protected by an earlier version.
    await page.evaluate(async () => {
      const conn = await new Promise<IDBDatabase>((res) => {
        const r = indexedDB.open("ndf-vault");
        r.onsuccess = () => res(r.result);
      });
      const meta = await new Promise<Record<string, unknown>>((res) => {
        const r = conn.transaction("state").objectStore("state").get("meta");
        r.onsuccess = () => res(r.result);
      });
      delete meta.recovery;
      delete meta.recoveryAt;
      await new Promise<void>((res) => {
        const tx = conn.transaction("state", "readwrite");
        tx.objectStore("state").put(meta, "meta");
        tx.oncomplete = () => res();
      });
      conn.close();
    });
    await page.reload();
    // Locked, with no code: forgetting leads straight to erasing, and says why.
    await page.getByRole("button", { name: "Phrase secrète oubliée ?" }).click();
    await expect(page.getByText("Aucun code de récupération n’a été créé pour ce Vault")).toBeVisible();
    await page.getByRole("button", { name: "Annuler" }).click();
    await unlock(page);
    await go(page, "preferences");
    await expect(main(page).getByText("Aucun code : si la phrase secrète est oubliée")).toBeVisible();
    await main(page).getByRole("button", { name: "Créer un code" }).click();
    await page.fill("#recovery-current", PASS);
    await dialog(page).locator("button[type=submit]").click();
    expect(await noteRecoveryCode(page)).toMatch(/^([0-9A-Z]{4}-){5}[0-9A-Z]{4}$/);
  });
});
