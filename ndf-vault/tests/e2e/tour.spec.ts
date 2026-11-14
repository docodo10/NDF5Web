import { expect, test } from "@playwright/test";
import { main, openVault } from "./helpers";

const STEPS = ["Vos vues", "L’index du Vault", "Recherche globale", "Ajoutez vos documents", "Vos fichiers", "Protégez le Vault", "Besoin d’un rappel ?"];

test("the tour starts on the first visit and walks through every step", async ({ page }) => {
  await openVault(page, "home", { tour: true });
  const tour = page.getByRole("dialog");
  await expect(page.locator("#tour-title")).toHaveText("Bienvenue dans NDF Vault");
  await tour.getByRole("button", { name: /Commencer la visite/ }).click();
  for (const [i, title] of STEPS.entries()) {
    await expect(page.locator("#tour-title")).toHaveText(title);
    await tour.getByRole("button", { name: i === STEPS.length - 1 ? /Terminer/ : "Compris" }).click();
  }
  await expect(tour).toBeHidden();

  // It is remembered: a reload does not bring it back.
  await page.reload();
  await expect(main(page)).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("the tour can be skipped, relaunched and closed from the keyboard", async ({ page }) => {
  await openVault(page, "files", { tour: true });
  await page.getByRole("dialog").getByRole("button", { name: "Passer" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByRole("button", { name: "Visite guidée" }).click();
  await expect(page.locator("#tour-title")).toHaveText("Bienvenue dans NDF Vault");
  // The tour always runs from the home page, where its targets are.
  await expect(page).toHaveURL(/#home$/);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#tour-title")).toHaveText(STEPS[0]);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#tour-title")).toHaveText(STEPS[1]);
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#tour-title")).toHaveText(STEPS[0]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("the app underneath cannot be clicked while the tour is running", async ({ page }) => {
  await openVault(page, "home", { tour: true });
  await page.getByRole("button", { name: /Commencer la visite/ }).click();
  await page.mouse.click(700, 500);
  await expect(page).toHaveURL(/#home$/);
  await expect(page.locator("#tour-title")).toHaveText(STEPS[0]);
});
