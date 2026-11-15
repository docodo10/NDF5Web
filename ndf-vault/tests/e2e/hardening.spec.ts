import { expect, test } from "@playwright/test";
import { dialog, downloaded, go, lockScreen, main, openVault, PASS, pdfFile, protect, readZip, row, tamperFirstOriginal, textFile, toast, unlock, upload } from "./helpers";

type Page = import("@playwright/test").Page;

const SECRET = "Clause confidentielle numéro quarante-deux";

async function seeded(page: Page) {
  await openVault(page);
  await upload(page, [textFile("Entente secrète.txt", SECRET), await pdfFile("Plan financier.pdf", 2)], "legal");
}

const securityJournal = async (page: Page) => {
  await go(page, "activity");
  await main(page).getByRole("tab", { name: /Sécurité/ }).click();
  return main(page);
};

test.describe("integrity check of the whole vault", () => {
  test("confirms that every original, earlier versions included, is intact", async ({ page }) => {
    await seeded(page);
    await row(page, "Entente secrète").getByRole("button", { name: /^Actions pour/ }).click();
    await page.getByRole("menuitem", { name: "Historique des versions", exact: true }).click();
    await dialog(page).locator("#version-input").setInputFiles(textFile("Entente secrète.txt", "Deuxième version"));
    await expect(dialog(page).getByRole("list", { name: "Versions" }).getByRole("listitem")).toHaveCount(2);
    await page.keyboard.press("Escape");

    await go(page, "preferences");
    await main(page).getByRole("button", { name: "Vérifier", exact: true }).click();
    const report = dialog(page).locator("[data-audit-report]");
    await expect(report).toContainText("Les 3 originaux sont intacts");
    await expect(report.getByRole("list")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(await securityJournal(page)).toContainText("a vérifié l’intégrité du Vault : 3 originaux intacts");
  });

  test("names the file that was altered on disk, in clear and when encrypted", async ({ page }) => {
    await seeded(page);
    await tamperFirstOriginal(page);
    await go(page, "preferences");
    await main(page).getByRole("button", { name: "Vérifier", exact: true }).click();
    const report = dialog(page).locator("[data-audit-report]");
    await expect(report).toContainText("1 original sur 2 pose problème");
    const problems = report.getByRole("list", { name: "Fichiers à problème" }).getByRole("listitem");
    await expect(problems).toHaveCount(1);
    await expect(problems).toContainText("Altéré");
    await page.keyboard.press("Escape");
    await expect(await securityJournal(page)).toContainText("1 problème sur 2 originaux");
  });

  test("detects an encrypted original that no longer authenticates, and one that is gone", async ({ page }) => {
    await seeded(page);
    await protect(page);
    await tamperFirstOriginal(page);
    // Remove another original outright.
    await page.evaluate(async () => {
      const conn = await new Promise<IDBDatabase>((res) => {
        const r = indexedDB.open("ndf-vault");
        r.onsuccess = () => res(r.result);
      });
      const keys = await new Promise<IDBValidKey[]>((res) => {
        const r = conn.transaction("blobs").objectStore("blobs").getAllKeys();
        r.onsuccess = () => res(r.result);
      });
      const originals = keys.map(String).filter((k) => k.startsWith("f-"));
      await new Promise<void>((res) => {
        const tx = conn.transaction("blobs", "readwrite");
        tx.objectStore("blobs").delete(originals[1]);
        tx.oncomplete = () => res();
      });
      conn.close();
    });
    await main(page).getByRole("button", { name: "Vérifier", exact: true }).click();
    const report = dialog(page).locator("[data-audit-report]");
    await expect(report).toContainText("2 originaux sur 2 posent problème");
    await expect(report.getByRole("list").getByRole("listitem").filter({ hasText: "Altéré" })).toHaveCount(1);
    await expect(report.getByRole("list").getByRole("listitem").filter({ hasText: "Introuvable" })).toHaveCount(1);
  });

  test("says so when there is nothing to check", async ({ page }) => {
    await openVault(page, "preferences");
    await main(page).getByRole("button", { name: "Vérifier", exact: true }).click();
    await expect(dialog(page).locator("[data-audit-report]")).toContainText("Aucun original à vérifier");
  });
});

test.describe("sensitive actions in a protected vault", () => {
  test("exporting everything unencrypted takes the passphrase", async ({ page }) => {
    await seeded(page);
    await protect(page);
    await main(page).getByRole("button", { name: "Exporter", exact: true }).click();
    await expect(dialog(page)).toContainText("L’archive ZIP n’est pas chiffrée");
    const submit = dialog(page).locator("button[type=submit]");
    await expect(submit).toBeDisabled();
    await page.fill("#export-passphrase", "pas la bonne phrase");
    await submit.click();
    await expect(dialog(page)).toContainText("Phrase secrète incorrecte.");
    await page.fill("#export-passphrase", PASS);
    const [download] = await Promise.all([page.waitForEvent("download"), submit.click()]);
    const names = readZip(await downloaded(download)).map((e) => e.name);
    expect(names).toContain("06 Juridique et chaîne de titres/Entente secrète.txt");
    expect(names).toContain("manifeste.json");
  });

  test("erasing everything takes the passphrase", async ({ page }) => {
    await seeded(page);
    await protect(page);
    await main(page).getByRole("button", { name: "Réinitialiser" }).click();
    const submit = dialog(page).locator("button[type=submit]");
    await expect(submit).toBeDisabled();
    await page.fill("#reset-passphrase", "pas la bonne phrase");
    await submit.click();
    await expect(dialog(page)).toContainText("Phrase secrète incorrecte.");
    // Nothing was erased by the refused attempt.
    await page.keyboard.press("Escape");
    await go(page, "folder-legal");
    await expect(row(page, "Entente secrète")).toBeVisible();

    await go(page, "preferences");
    await main(page).getByRole("button", { name: "Réinitialiser" }).click();
    await page.fill("#reset-passphrase", PASS);
    await dialog(page).locator("button[type=submit]").click();
    await expect(toast(page)).toContainText("Vault réinitialisé");
    await go(page, "folder-legal");
    await expect(row(page, "Entente secrète")).toHaveCount(0);
  });

  test("an unprotected vault is not asked for a passphrase it does not have", async ({ page }) => {
    await seeded(page);
    await go(page, "preferences");
    const [download] = await Promise.all([page.waitForEvent("download"), main(page).getByRole("button", { name: "Exporter", exact: true }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    await main(page).getByRole("button", { name: "Réinitialiser" }).click();
    await expect(page.locator("#reset-passphrase")).toHaveCount(0);
    await expect(dialog(page).locator("button[type=submit]")).toBeEnabled();
  });
});

test.describe("lock journal", () => {
  test("records a manual lock and an automatic one, each for what it was", async ({ page }) => {
    await page.clock.install();
    await seeded(page);
    await protect(page);
    await page.getByRole("button", { name: "Verrouiller le Vault" }).click();
    await expect(lockScreen(page)).toBeVisible();
    await unlock(page);

    await go(page, "preferences");
    await page.locator("#auto-lock").selectOption("1");
    await page.clock.fastForward(70_000);
    await expect(lockScreen(page)).toBeVisible({ timeout: 15_000 });
    await unlock(page);

    const journal = await securityJournal(page);
    await expect(journal.getByText("a verrouillé le Vault")).toHaveCount(2);
    await expect(journal.getByText("automatiquement, après une période sans activité")).toHaveCount(1);
  });
});

test.describe("privacy screen", () => {
  const veil = (page: Page) => page.locator("[data-privacy-veil]");
  const leave = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event("blur")));

  test("is off unless asked for", async ({ page }) => {
    await seeded(page);
    await leave(page);
    await expect(veil(page)).toHaveCount(0);
  });

  test("covers the vault when its window stops being active, and comes back on return", async ({ page }) => {
    await seeded(page);
    await go(page, "preferences");
    await main(page).getByRole("switch", { name: "Écran de confidentialité" }).click();
    await go(page, "folder-legal");
    await expect(row(page, "Entente secrète")).toBeVisible();

    await leave(page);
    await expect(veil(page)).toBeVisible();
    await expect(veil(page)).toContainText("Contenu masqué");
    // The veil sits above everything, the document viewer included.
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(veil(page)).toHaveCount(0);
    await row(page, "Entente secrète").click();
    await expect(dialog(page).locator("[data-viewer-canvas]")).toContainText(SECRET);
    await leave(page);
    await expect(veil(page)).toBeVisible();
    const covering = await page.evaluate(() => {
      const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return Boolean(el?.closest("[data-privacy-veil]"));
    });
    expect(covering).toBe(true);
    await veil(page).click();
    await expect(veil(page)).toHaveCount(0);

    // The choice is remembered.
    await page.reload();
    await expect(row(page, "Entente secrète")).toBeVisible();
    await leave(page);
    await expect(veil(page)).toBeVisible();
  });
});
