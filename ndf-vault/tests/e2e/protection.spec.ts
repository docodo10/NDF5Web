import { expect, test } from "@playwright/test";
import { dialog, diskDump, downloaded, go, lockScreen, main, openVault, PASS, pdfFile, pngFile, protect, readZip, row, rowMenu, textFile, toast, unlock, upload } from "./helpers";

type Page = import("@playwright/test").Page;
type Level = "Standard" | "Consultation seule" | "Haute protection";

const SECRET = "Clause confidentielle numéro quarante-deux";
const body = (page: Page) => dialog(page).locator("[data-viewer-canvas]");

async function seeded(page: Page) {
  await openVault(page);
  await upload(page, [await pdfFile("Plan financier.pdf", 3), pngFile("Affiche.png", 640, 400), textFile("Entente.txt", SECRET)], "legal");
}

/** Set a file's protection level through its menu. */
async function setLevel(page: Page, name: string, level: Level, passphrase?: string) {
  await rowMenu(page, name, "Protection");
  await dialog(page).getByRole("radio", { name: new RegExp(`^${level}`) }).check();
  if (passphrase !== undefined) await page.fill("#protection-passphrase", passphrase);
  await dialog(page).locator("button[type=submit]").click();
}

const securityJournal = async (page: Page) => {
  await go(page, "activity");
  await main(page).getByRole("tab", { name: /Sécurité/ }).click();
  return main(page);
};

test.describe("view-only documents", () => {
  test("cannot be downloaded, exported or saved with a watermark, and the attempt is logged", async ({ page }) => {
    await seeded(page);
    await setLevel(page, "Plan financier", "Consultation seule");
    await expect(row(page, "Plan financier").locator("[data-protected=view]")).toBeVisible();

    // From the menu: refused, with a reason.
    await rowMenu(page, "Plan financier", "Télécharger");
    await expect(toast(page)).toContainText("consultation seule : le téléchargement est bloqué");
    await row(page, "Plan financier").getByRole("button", { name: /^Actions pour/ }).click();
    await expect(page.getByRole("menuitem", { name: "Télécharger avec filigrane" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // In the viewer: no download button at all, and the level is shown.
    await row(page, "Plan financier").click();
    await expect(dialog(page).locator("[data-protection-chip]")).toContainText("Consultation seule");
    await expect(dialog(page).getByRole("button", { name: "Télécharger", exact: true })).toHaveCount(0);
    await expect(dialog(page).getByRole("button", { name: "Télécharger avec filigrane" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // In an archive: left out, and the message says so. An unprotected file still goes.
    await row(page, "Plan financier").getByRole("checkbox").click();
    await row(page, "Entente").getByRole("checkbox").click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("toolbar", { name: "Actions groupées" }).getByRole("button", { name: /Exporter \(ZIP\)/ }).click()]);
    expect(readZip(await downloaded(download)).map((e) => e.name)).toEqual(["06 Juridique et chaîne de titres/Entente.txt"]);
    await expect(toast(page)).toContainText("1 fichier protégé ou illisible laissé de côté");

    await expect(await securityJournal(page)).toContainText("a tenté de télécharger un document en consultation seule : Plan financier.pdf");
  });

  test("carry their watermark in the pixels, where it cannot be deleted from the page", async ({ page }) => {
    await seeded(page);
    // Standard: the watermark is an element laid over the page.
    await row(page, "Plan financier").click();
    await expect(body(page).locator("[data-personal-watermark]").first()).toBeAttached();
    await expect(body(page).locator("canvas[data-baked]")).toHaveCount(0);
    await page.keyboard.press("Escape");

    await setLevel(page, "Plan financier", "Consultation seule");
    await row(page, "Plan financier").click();
    const first = body(page).locator("canvas").first();
    await expect(first).toHaveAttribute("data-baked", "true");
    await expect(body(page).locator("[data-personal-watermark]")).toHaveCount(0);
    // The page is no longer just black text on white: the watermark's grey is in the image.
    const grey = await first.evaluate((c: HTMLCanvasElement) => {
      const px = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] > 150 && px[i] < 245 && Math.abs(px[i] - px[i + 1]) < 6 && Math.abs(px[i] - px[i + 2]) < 6) n++;
      return n;
    });
    expect(grey).toBeGreaterThan(2000);
  });

  test("show a protected image only as a drawing, with no file behind it to open", async ({ page }) => {
    await seeded(page);
    await row(page, "Affiche").click();
    await expect(body(page).locator("img")).toHaveAttribute("src", /^blob:/);
    await page.keyboard.press("Escape");

    await setLevel(page, "Affiche", "Consultation seule");
    await row(page, "Affiche").click();
    const picture = body(page).getByRole("img", { name: "Affiche.png" });
    await expect(picture).toHaveAttribute("data-baked", "true");
    expect(await picture.evaluate((e) => e.tagName)).toBe("CANVAS");
    await expect(body(page).locator("img")).toHaveCount(0);
    expect(await page.evaluate(() => document.querySelectorAll('[src^="blob:"], [href^="blob:"]').length)).toBe(0);
  });

  test("refuse the right click, the copy and the save shortcut", async ({ page }) => {
    await seeded(page);
    const prevented = (type: string, init: Record<string, unknown> = {}) =>
      body(page).evaluate(
        (el, [t, i]) => {
          const event = t === "keydown" ? new KeyboardEvent(t, { bubbles: true, cancelable: true, ...(i as object) }) : new Event(t as string, { bubbles: true, cancelable: true });
          el.dispatchEvent(event);
          return event.defaultPrevented;
        },
        [type, init] as const,
      );
    await row(page, "Entente").click();
    await expect(body(page)).toContainText(SECRET);
    expect(await prevented("contextmenu")).toBe(false);
    expect(await prevented("copy")).toBe(false);
    await page.keyboard.press("Escape");

    await setLevel(page, "Entente", "Consultation seule");
    await row(page, "Entente").click();
    await expect(body(page)).toContainText(SECRET);
    for (const type of ["contextmenu", "copy", "cut", "dragstart"]) expect(await prevented(type), type).toBe(true);
    expect(await prevented("keydown", { key: "s", ctrlKey: true })).toBe(true);
    expect(await prevented("keydown", { key: "p", metaKey: true })).toBe(true);
    expect(await prevented("keydown", { key: "ArrowDown" })).toBe(false);
    expect(await body(page).evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  });

  test("the level given to new files is a setting", async ({ page }) => {
    await openVault(page, "preferences");
    await page.locator("#default-protection").selectOption("view");
    await go(page, "home");
    await upload(page, [textFile("Nouveau.txt", "contenu")], "legal");
    await expect(row(page, "Nouveau").locator("[data-protected=view]")).toBeVisible();
    // It survives a reload, like any other setting.
    await page.reload();
    await go(page, "preferences");
    await expect(page.locator("#default-protection")).toHaveValue("view");
  });
});

test.describe("high protection: the protected reading view", () => {
  test("shows only the band being read, and nothing when the pointer is away", async ({ page }) => {
    await seeded(page);
    await setLevel(page, "Plan financier", "Haute protection");
    await row(page, "Plan financier").click();
    const fence = dialog(page).locator("[data-fence]");
    await expect(body(page).locator("canvas[data-baked]").first()).toBeVisible();
    // Thumbnails would show whole pages: they are gone, and the mode cannot be switched off.
    await expect(dialog(page).getByRole("complementary", { name: "Vignettes des pages" })).toHaveCount(0);
    await expect(dialog(page).getByRole("button", { name: /Lecture protégée \(imposée/ })).toBeDisabled();

    // Pointer away from the document: everything is covered.
    await page.mouse.move(5, 5);
    await expect(fence).toHaveAttribute("data-reading", "false");
    await expect(fence.getByText("Placez le pointeur ou le doigt sur le document")).toBeVisible();

    // Pointer on the document: a band around it is clear, the rest is covered.
    const box = (await body(page).boundingBox())!;
    const y = box.y + box.height * 0.5;
    await page.mouse.move(box.x + box.width / 2, y);
    await expect(fence).toHaveAttribute("data-reading", "true");
    const geometry = await fence.evaluate((el) => {
      const host = el.getBoundingClientRect();
      const [top, bottom] = Array.from(el.querySelectorAll(".fence-cover")).map((c) => c.getBoundingClientRect());
      return { height: host.height, clearFrom: top.bottom - host.top, clearTo: bottom.top - host.top, blurred: getComputedStyle(el.querySelector(".fence-cover")!).backdropFilter };
    });
    const pointer = y - box.y;
    expect(geometry.clearFrom).toBeLessThan(pointer);
    expect(geometry.clearTo).toBeGreaterThan(pointer);
    // The clear band is a small part of the page: a photo catches a few lines at most.
    const band = geometry.clearTo - geometry.clearFrom;
    expect(band).toBeGreaterThan(90);
    expect(band / geometry.height).toBeLessThan(0.3);
    expect(geometry.blurred).toContain("blur");

    // The band follows the pointer.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8);
    const lower = await fence.evaluate((el) => el.querySelector(".fence-cover")!.getBoundingClientRect().bottom - el.getBoundingClientRect().top);
    expect(lower).toBeGreaterThan(geometry.clearFrom + 100);

    // Leaving the document, or the window, covers it all again.
    await page.mouse.move(5, 5);
    await expect(fence).toHaveAttribute("data-reading", "false");
  });

  test("covers the document as soon as the window stops being active, whatever the privacy setting", async ({ page }) => {
    await seeded(page);
    await setLevel(page, "Entente", "Haute protection");
    await row(page, "Entente").click();
    await expect(body(page)).toContainText(SECRET);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(page.locator("[data-privacy-veil]")).toBeVisible();
    await page.locator("[data-privacy-veil]").click();
    // Closed, the vault goes back to the setting, which is off.
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(page.locator("[data-privacy-veil]")).toHaveCount(0);
  });

  test("the reading view can be chosen for any document", async ({ page }) => {
    await seeded(page);
    await row(page, "Plan financier").click();
    await expect(dialog(page).locator("[data-fence]")).toHaveCount(0);
    await dialog(page).getByRole("button", { name: "Lecture protégée", exact: true }).click();
    await expect(dialog(page).locator("[data-fence]")).toBeVisible();
    await dialog(page).getByRole("button", { name: "Quitter la lecture protégée" }).click();
    await expect(dialog(page).locator("[data-fence]")).toHaveCount(0);
  });
});

test.describe("taking protection away", () => {
  test("takes the passphrase in a protected vault, and is free to add", async ({ page }) => {
    await seeded(page);
    await protect(page);
    await go(page, "folder-legal");
    // Raising the level asks for nothing.
    await setLevel(page, "Plan financier", "Haute protection");
    await expect(row(page, "Plan financier").locator("[data-protected=high]")).toBeVisible();

    await rowMenu(page, "Plan financier", "Protection");
    await dialog(page).getByRole("radio", { name: /^Standard/ }).check();
    const submit = dialog(page).locator("button[type=submit]");
    await expect(submit).toBeDisabled();
    await page.fill("#protection-passphrase", "pas la bonne phrase");
    await submit.click();
    await expect(dialog(page)).toContainText("Phrase secrète incorrecte.");
    await page.keyboard.press("Escape");
    await expect(row(page, "Plan financier").locator("[data-protected=high]")).toBeVisible();

    await setLevel(page, "Plan financier", "Standard", PASS);
    await expect(row(page, "Plan financier").locator("[data-protected]")).toHaveCount(0);
    const journal = await securityJournal(page);
    await expect(journal).toContainText("a réglé la protection sur « Haute protection » pour Plan financier.pdf");
    await expect(journal).toContainText("a réglé la protection sur « Standard » pour Plan financier.pdf");
  });
});

test.describe("tracing a leak", () => {
  test("every opening has its own code, printed in the watermark and found again in the journal", async ({ page }) => {
    await seeded(page);
    const mark = body(page).locator("[data-personal-watermark]").first();
    const codeOf = async () => /· ([0-9A-Z]{3}-[0-9A-Z]{3})/.exec(await mark.innerText())![1];
    await row(page, "Entente").click();
    const first = await codeOf();
    await page.keyboard.press("Escape");
    await row(page, "Entente").click();
    const second = await codeOf();
    await page.keyboard.press("Escape");
    expect(second).not.toBe(first);

    // Someone reads the code off a photo and types it, any which way.
    await go(page, "activity");
    await expect(main(page).locator("[data-code]")).toHaveCount(2);
    await main(page).getByRole("searchbox").fill(first.toLowerCase().replace("-", " "));
    const found = main(page).getByRole("listitem").filter({ has: page.locator("[data-code]") });
    await expect(found).toHaveCount(1);
    await expect(found).toContainText("a ouvert Entente.txt");
    await expect(found.locator("[data-code]")).toHaveText(first);
    await main(page).getByRole("searchbox").fill("ZZZ-ZZZ");
    await expect(main(page)).toContainText("Aucune entrée ne correspond");
    // The export carries the codes too.
    await main(page).getByRole("searchbox").fill("");
    const [download] = await Promise.all([page.waitForEvent("download"), main(page).getByRole("button", { name: "Exporter (CSV)" }).click()]);
    const csv = (await downloaded(download)).toString("utf8");
    expect(csv).toContain("Code de consultation");
    expect(csv).toContain(first);
    expect(csv).toContain(second);
  });

  test("a screen-capture key covers a protected document and goes to the journal with the code", async ({ page }) => {
    await seeded(page);
    await setLevel(page, "Entente", "Consultation seule");
    await row(page, "Entente").click();
    await expect(body(page)).toContainText(SECRET);
    const code = /· ([0-9A-Z]{3}-[0-9A-Z]{3})/.exec(await body(page).locator("[data-personal-watermark]").first().innerText())![1];
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { key: "PrintScreen" })));
    const veil = dialog(page).locator("[data-capture-veil]");
    await expect(veil).toContainText("Capture d’écran détectée");
    // The cover sits over the document.
    const covered = await body(page).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return Boolean(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest("[data-capture-veil]"));
    });
    expect(covered).toBe(true);
    await page.keyboard.press("Escape");
    const entry = (await securityJournal(page)).getByRole("listitem").filter({ hasText: "a pressé une touche de capture d’écran" });
    await expect(entry).toContainText("Entente.txt");
    await expect(entry.locator("[data-code]")).toHaveText(code);
  });

  test("an unprotected document does not react to the capture key", async ({ page }) => {
    await seeded(page);
    await row(page, "Entente").click();
    await expect(body(page)).toContainText(SECRET);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { key: "PrintScreen" })));
    await expect(dialog(page).locator("[data-capture-veil]")).toHaveCount(0);
  });

  test("nothing prints", async ({ page }) => {
    await seeded(page);
    await page.emulateMedia({ media: "print" });
    await expect(main(page)).toBeHidden();
    expect(await page.evaluate(() => getComputedStyle(document.body, "::before").content)).toContain("impression est désactivée");
  });
});

test.describe("last-resort defenses", () => {
  test("three quick presses on Escape lock the vault at once", async ({ page }) => {
    await seeded(page);
    await protect(page);
    await go(page, "folder-legal");
    await row(page, "Entente").click();
    await expect(body(page)).toContainText(SECRET);
    for (let i = 0; i < 3; i++) await page.keyboard.press("Escape");
    await expect(lockScreen(page)).toBeVisible();
    await unlock(page);
    await expect(await securityJournal(page)).toContainText("a verrouillé le Vault");
  });

  test("Escape pressed now and then, as one does to close things, locks nothing", async ({ page }) => {
    await page.clock.install();
    await seeded(page);
    await protect(page);
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Escape");
      await page.clock.fastForward(2000);
    }
    await expect(main(page)).toBeVisible();
    await expect(lockScreen(page)).toHaveCount(0);
  });

  test("the erase option warns on the lock screen and erases the vault at the limit", async ({ page }) => {
    await seeded(page);
    await protect(page);
    await main(page).getByRole("switch", { name: "Effacement après 10 tentatives" }).click();
    await expect.poll(() => diskDump(page)).toContain('"wipeAfter":10');
    // Bring the limit down to three for the test: ten attempts take minutes of enforced waiting.
    await page.evaluate(async () => {
      const conn = await new Promise<IDBDatabase>((res) => {
        const r = indexedDB.open("ndf-vault");
        r.onsuccess = () => res(r.result);
      });
      const meta = await new Promise<Record<string, unknown>>((res) => {
        const r = conn.transaction("state").objectStore("state").get("meta");
        r.onsuccess = () => res(r.result);
      });
      await new Promise<void>((res) => {
        const tx = conn.transaction("state", "readwrite");
        tx.objectStore("state").put({ ...meta, wipeAfter: 3 }, "meta");
        tx.oncomplete = () => res();
      });
      conn.close();
    });
    await page.reload();
    const wrong = async () => {
      await page.fill("#unlock-passphrase", "pas la bonne phrase");
      await page.keyboard.press("Enter");
    };
    await wrong();
    await expect(page.locator("[data-wipe-warning]")).toHaveText("Encore 2 tentatives avant l’effacement du Vault.");
    await wrong();
    await expect(page.locator("[data-wipe-warning]")).toHaveText("Encore une tentative avant l’effacement du Vault.");
    await wrong();
    // Gone: the vault reopens empty, says why, and nothing of it is left on disk.
    await expect(main(page)).toBeVisible({ timeout: 20_000 });
    await expect(toast(page)).toContainText("Trop de tentatives échouées : le Vault a été effacé de cet appareil.");
    await go(page, "folder-legal");
    // (A sample file of that folder also has "entente" in its name: look for the uploads that do not.)
    await expect(main(page).getByText("Modèle de contrat d’option")).toBeVisible();
    await expect(row(page, "Affiche")).toHaveCount(0);
    await expect(row(page, "Plan financier")).toHaveCount(0);
    const dump = await diskDump(page);
    expect(dump).not.toContain('"protected":true');
    expect(dump).not.toContain('"wrapped"');
  });
});

test.describe("security checkup", () => {
  const checkup = (page: Page) => main(page).locator("[data-checkup]");
  const done = (page: Page, label: string) => checkup(page).locator("li[data-check=true]", { hasText: label });

  test("says what is in place and offers the next step for what is not", async ({ page }) => {
    await seeded(page);
    await go(page, "preferences");
    await expect(done(page, "Protection par phrase secrète")).toHaveCount(0);
    await expect(checkup(page).getByRole("button", { name: "Activer" })).toBeVisible();
    await expect(checkup(page)).toContainText("Aucune sauvegarde faite depuis cet appareil.");

    await protect(page);
    for (const label of ["Protection par phrase secrète", "Code de récupération", "Verrouillage automatique"]) await expect(done(page, label)).toHaveCount(1);
    // "Never" is not a lock.
    await page.locator("#auto-lock").selectOption("0");
    await expect(done(page, "Verrouillage automatique")).toHaveCount(0);
    await expect(checkup(page)).toContainText("Réglé sur « Jamais »");
    await page.locator("#auto-lock").selectOption("5");
    await expect(done(page, "Verrouillage automatique")).toHaveCount(1);

    // The offered steps lead somewhere, and count once done.
    await checkup(page).getByRole("button", { name: "Vérifier" }).click();
    await expect(dialog(page).locator("[data-audit-report]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(done(page, "Intégrité vérifiée")).toHaveCount(1);
    await checkup(page).getByRole("button", { name: "Sauvegarder" }).click();
    await page.fill("#backup-new", "valise horloge sentier cuivre");
    await page.fill("#backup-confirm", "valise horloge sentier cuivre");
    await Promise.all([page.waitForEvent("download"), dialog(page).locator("button[type=submit]").click()]);
    await expect(done(page, "Sauvegarde chiffrée")).toHaveCount(1);
    await expect(checkup(page)).toContainText("5 sur 6");
  });
});
