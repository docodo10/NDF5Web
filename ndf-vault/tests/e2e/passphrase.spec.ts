import { expect, test } from "@playwright/test";
import { dialog, diskDump, go, lockScreen, main, noteRecoveryCode, openVault, PASS, protect, row, rowMenu, textFile, toast, unlock, upload } from "./helpers";

type Page = import("@playwright/test").Page;

const SECRET = "Clause confidentielle numéro quarante-deux";
const body = (page: Page) => dialog(page).locator("[data-viewer-canvas]");

async function seeded(page: Page) {
  await openVault(page);
  await upload(page, [textFile("Mandat.txt", SECRET)], "legal");
}

test.describe("key derivation", () => {
  test("a new vault is protected with memory-hard scrypt, and stores nothing derived from the passphrase", async ({ page }) => {
    await seeded(page);
    await protect(page);
    const dump = await diskDump(page);
    expect(dump).toContain('"scrypt":{"n":65536,"r":8,"p":2}');
    expect(dump).not.toContain(PASS);
    await page.reload();
    await unlock(page);
    await go(page, "folder-legal");
    await row(page, "Mandat").click();
    await expect(body(page)).toContainText(SECRET);
  });
});

test.describe("suggested passphrase", () => {
  test("offers a strong random phrase, which still has to be typed again to prove it was taken down", async ({ page }) => {
    await seeded(page);
    await go(page, "preferences");
    await main(page).getByRole("button", { name: "Activer", exact: true }).last().click();
    await dialog(page).getByRole("button", { name: "Proposer une phrase forte" }).click();
    const box = dialog(page).locator("[data-suggested]");
    const phrase = (await box.locator("p").first().innerText()).trim();
    expect(phrase).toMatch(/^([bdfgjklmnprstvz][aeiou]){3}(-([bdfgjklmnprstvz][aeiou]){3}){4}$/);
    await expect(box).toContainText("93 bits");
    await expect(dialog(page)).toContainText("Forte.");
    await expect(page.locator("#protect-new")).toHaveValue(phrase);
    await expect(page.locator("#protect-confirm")).toHaveValue("");
    await page.check("#protect-understood");
    const submit = dialog(page).locator("button[type=submit]");
    await expect(submit).toBeDisabled();
    // Another draw gives another phrase.
    await box.getByRole("button", { name: "Une autre" }).click();
    const second = (await box.locator("p").first().innerText()).trim();
    expect(second).not.toBe(phrase);
    await page.fill("#protect-confirm", second);
    await submit.click();
    await noteRecoveryCode(page);
    await dialog(page).getByRole("button", { name: "Terminer" }).click();
    await page.reload();
    await unlock(page, second);
    await expect(main(page)).toBeVisible();
  });
});

test.describe("an open session is not enough", () => {
  test("a document in high protection asks for the passphrase again once it has not been given for a while", async ({ page }) => {
    await page.clock.install();
    await seeded(page);
    await protect(page);
    await page.locator("#auto-lock").selectOption("0");
    await go(page, "folder-legal");
    await rowMenu(page, "Mandat", "Protection");
    await dialog(page).getByRole("radio", { name: /^Haute protection/ }).check();
    await dialog(page).locator("button[type=submit]").click();

    // The passphrase was just typed to turn protection on: the document opens.
    await row(page, "Mandat").click();
    await expect(body(page)).toContainText(SECRET);
    await page.keyboard.press("Escape");

    // Ten minutes later, in the same session, it does not.
    await page.clock.fastForward(10 * 60_000);
    await row(page, "Mandat").click();
    const ask = page.getByRole("dialog", { name: "Document en haute protection" });
    await expect(ask).toBeVisible();
    await expect(page.locator("[data-viewer-canvas]")).toHaveCount(0);
    await page.fill("#doc-passphrase", "pas la bonne phrase");
    await ask.locator("button[type=submit]").click();
    await expect(ask).toContainText("Phrase secrète incorrecte.");
    await expect(page.locator("[data-viewer-canvas]")).toHaveCount(0);
    await page.fill("#doc-passphrase", PASS);
    await ask.locator("button[type=submit]").click();
    await expect(body(page)).toContainText(SECRET);
    await page.keyboard.press("Escape");
    // Good for a few minutes, then asked again.
    await row(page, "Mandat").click();
    await expect(body(page)).toContainText(SECRET);
  });

  test("an unprotected vault has no passphrase to ask for", async ({ page }) => {
    await seeded(page);
    await rowMenu(page, "Mandat", "Protection");
    await dialog(page).getByRole("radio", { name: /^Haute protection/ }).check();
    await dialog(page).locator("button[type=submit]").click();
    await row(page, "Mandat").click();
    await expect(body(page)).toContainText(SECRET);
  });

  test("five wrong passphrases in a row lock the vault, from inside too", async ({ page }) => {
    await seeded(page);
    await protect(page);
    await main(page).getByRole("button", { name: "Réinitialiser" }).click();
    const submit = dialog(page).locator("button[type=submit]");
    for (let i = 0; i < 4; i++) {
      await page.fill("#reset-passphrase", `mauvaise phrase ${i}`);
      await submit.click();
      await expect(dialog(page)).toContainText("Phrase secrète incorrecte.");
      await expect(submit).toBeEnabled();
    }
    await page.fill("#reset-passphrase", "cinquième mauvaise phrase");
    await submit.click();
    await expect(lockScreen(page)).toBeVisible({ timeout: 15_000 });
    // Nothing was erased, and the journal says why it locked.
    await unlock(page);
    await go(page, "folder-legal");
    await expect(row(page, "Mandat")).toBeVisible();
    await go(page, "activity");
    await main(page).getByRole("tab", { name: /Sécurité/ }).click();
    await expect(main(page)).toContainText("a verrouillé le Vault automatiquement, après 5 phrases secrètes refusées");
  });

  test("a right passphrase in between starts the count again", async ({ page }) => {
    await seeded(page);
    await protect(page);
    for (let round = 0; round < 2; round++) {
      await main(page).getByRole("button", { name: "Exporter", exact: true }).click();
      const submit = dialog(page).locator("button[type=submit]");
      for (let i = 0; i < 3; i++) {
        await page.fill("#export-passphrase", `mauvaise phrase ${i}`);
        await submit.click();
        await expect(dialog(page)).toContainText("Phrase secrète incorrecte.");
      }
      await page.fill("#export-passphrase", PASS);
      await Promise.all([page.waitForEvent("download"), submit.click()]);
      await expect(toast(page)).toContainText("exporté");
    }
    await expect(main(page)).toBeVisible();
    await expect(lockScreen(page)).toHaveCount(0);
  });
});
