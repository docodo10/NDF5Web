import { devices, expect, test } from "@playwright/test";
import { main, openFile, openVault, pdfFile, row, upload } from "./helpers";

// A real phone profile: touch input, no hover, mobile viewport.
const phone = devices["Pixel 7"];
test.use({ viewport: phone.viewport, userAgent: phone.userAgent, hasTouch: true, isMobile: true });

const menu = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Navigation principale" });

test("on a phone the tour opens the menu when it needs to point at it", async ({ page }) => {
  await openVault(page, "home", { tour: true });
  await page.getByRole("button", { name: /Commencer la visite/ }).click();
  await expect(page.locator("#tour-title")).toHaveText("Vos vues");
  await expect(menu(page)).toBeVisible();
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Compris" }).click();
  await page.getByRole("button", { name: /Terminer/ }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  // The menu is put away again when the tour ends.
  await expect(menu(page)).toBeHidden();
});

test("on a phone the menu is a drawer and the page never scrolls sideways", async ({ page }) => {
  await openVault(page, "home");
  await expect(menu(page)).toBeHidden();
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await menu(page).getByRole("button", { name: "Tous les fichiers" }).click();
  await expect(page).toHaveURL(/#files$/);
  await expect(menu(page)).toBeHidden();
  await expect(row(page, "Mot de bienvenue")).toBeVisible();
  for (const view of ["home", "files", "projects", "activity", "preferences", "folder-root", "project-pb1"]) {
    await page.evaluate((h) => (window.location.hash = h), view);
    await expect(main(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), view).toBe(true);
  }
});

test("on a phone a file can be uploaded and opened full screen", async ({ page }) => {
  await openVault(page, "home");
  await upload(page, [await pdfFile("Contrat.pdf", 2)], "legal");
  await openFile(page, "Contrat");
  const viewer = page.getByRole("dialog");
  const first = viewer.locator("[data-viewer-canvas] canvas").first();
  await expect(first).toBeVisible();
  const width = page.viewportSize()!.width;
  // Full width once its opening animation has settled, to within the fraction of a pixel a phone's pixel ratio leaves.
  await expect.poll(async () => Math.abs((await viewer.boundingBox())!.width - width)).toBeLessThan(1);
  // The page fits the screen instead of overflowing it.
  const box = (await first.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(Math.floor(box.x + box.width)).toBeLessThanOrEqual(width);
});

test("on a phone a tap on a file row opens it, without needing a second tap", async ({ page }) => {
  await openVault(page, "files");
  await row(page, "Mot de bienvenue").tap();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Mot de bienvenue.pdf" })).toBeVisible();
});
