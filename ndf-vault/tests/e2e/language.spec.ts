import { expect, test } from "@playwright/test";
import { dialog, go, main, openVault, pdfFile, row, rowMenu, textFile, toast, upload, type Upload } from "./helpers";
import { docx, para, pptx, xlsx } from "../fixtures/office";

type Page = import("@playwright/test").Page;

const PASS = "turtle lamp storm window";
const switcher = (page: Page) => page.locator("[data-language-switch]").first();
const setLanguage = (page: Page, lang: "en" | "fr") => switcher(page).locator(`button[lang=${lang}]`).click();

/**
 * Every piece of French left on screen: visible text, and the labels, titles
 * and placeholders a person meets through a screen reader or a hover.
 * The language switch names both languages on purpose and is left out.
 */
async function french(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const accents = /[àâçéèêëîïôûùüœ]/i;
    // Common French interface words that carry no accent and would slip past the first check.
    const words = /\b(fichiers?|dossiers?|annuler|enregistrer|fermer|supprimer|renommer|rechercher|aucune?|ouvrir|ajouter|modifier|nouveau|nouvelle|tous les|toutes les|sur cet appareil|phrase|voir|avec|pour le|dans le|est|sont|vous|votre|vos)\b/i;
    const found = new Set<string>();
    const check = (text: string | null) => {
      for (const line of (text ?? "").split("\n")) {
        const s = line.trim();
        if (s && (accents.test(s) || words.test(s))) found.add(s.slice(0, 90));
      }
    };
    const skip = (el: Element) => el.closest("[data-language-switch]") !== null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (parent && !skip(parent) && !["SCRIPT", "STYLE"].includes(parent.tagName)) check(node.textContent);
    }
    for (const el of document.querySelectorAll("[aria-label], [title], [placeholder], [alt]")) {
      if (skip(el)) continue;
      for (const attr of ["aria-label", "title", "placeholder", "alt"]) check(el.getAttribute(attr));
    }
    return [...found];
  });
}

/** Open the vault as someone who arrives with no language in the address and no earlier choice. */
const arrive = (page: Page, hash = "home") => openVault(page, hash, { lang: "" });

/** Upload through the English interface. */
async function uploadFiles(page: Page, files: Upload[], folder: string): Promise<void> {
  await main(page).getByRole("button", { name: "Upload" }).first().click();
  const d = page.getByRole("dialog", { name: "Upload files" });
  await d.locator("#upload-input").setInputFiles(files);
  await d.locator("#upload-folder").selectOption(folder);
  await d.locator("button[type=submit]").click();
  await expect(d).toBeHidden();
}

/** Messages are written in the language of the moment and are gone in a few seconds: let them go before reading the page. */
const settled = (page: Page) => expect(toast(page)).toHaveCount(0, { timeout: 15_000 });

test.describe("which language the vault opens in", () => {
  test("is English by default", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("ndf-vault-tour-done", "1"));
    await page.goto("/preview.html#home");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("navigation").first().getByRole("button", { name: "Home" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome to NDF Vault");
    // The numbered index, the sample files and the dates are English too.
    await expect(page.locator("aside").getByText("Legal and Chain of Title").first()).toBeVisible();
    await expect(main(page).getByText("Welcome Note").first()).toBeVisible();
    await expect(main(page).getByText(/^Nov \d{1,2}, 2026$/).first()).toBeVisible();
    await expect(switcher(page).locator("button[lang=en]")).toHaveAttribute("aria-pressed", "true");
  });

  test("is French for someone who arrives from the French side of the site", async ({ page }) => {
    await openVault(page, "home", { lang: "fr" });
    await expect(page.locator("html")).toHaveAttribute("lang", "fr-CA");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bienvenue dans NDF Vault");
    await expect(page.locator("aside").getByText("Juridique et chaîne de titres").first()).toBeVisible();
    await expect(main(page).getByText("Mot de bienvenue").first()).toBeVisible();
  });

  test("follows the address over an earlier choice, and the earlier choice when the address says nothing", async ({ page }) => {
    await openVault(page, "home", { lang: "fr" });
    await setLanguage(page, "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome to NDF Vault");
    // The address was kept in step, so reloading does not undo the choice.
    await expect(page).toHaveURL(/lang=en/);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome to NDF Vault");

    // No language in the address: what was chosen on this device.
    await setLanguage(page, "fr");
    await page.goto("/preview.html#home");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bienvenue dans NDF Vault");
    // The English side of the site, whatever was chosen before.
    await page.goto("/preview.html?lang=en#home");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome to NDF Vault");
    // Anything else in the address is ignored: the earlier choice stands.
    await page.goto("/preview.html?lang=xx#home");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bienvenue dans NDF Vault");
  });
});

test.describe("switching language", () => {
  test("changes everything at once, without losing where one was or what one was doing", async ({ page }) => {
    await arrive(page, "folder-legal");
    await uploadFiles(page, [textFile("Contract.txt", "The price is 100 dollars.")], "legal");
    await expect(row(page, "Contract")).toBeVisible();
    await row(page, "Contract").getByRole("checkbox").click();
    await page.getByRole("button", { name: "Actions for Contract.txt" }).click();
    await page.getByRole("menuitem", { name: "Information" }).click();
    const panel = page.locator("[data-info-panel]");
    await expect(panel).toContainText("Legal and Chain of Title");
    await page.fill("#comment-text", "half-written note");

    await setLanguage(page, "fr");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr-CA");
    // Same page, same file, same selection, same half-written text.
    await expect(page).toHaveURL(/#folder-legal$/);
    await expect(panel).toContainText("Juridique et chaîne de titres");
    await expect(page.locator("#comment-text")).toHaveValue("half-written note");
    await expect(row(page, "Contract").getByRole("checkbox")).toBeChecked();
    await expect(main(page).getByRole("button", { name: "Téléverser" }).first()).toBeVisible();
    // A file someone uploaded keeps its name in both languages.
    await expect(row(page, "Contract")).toBeVisible();

    await setLanguage(page, "en");
    await expect(main(page).getByRole("button", { name: "Upload" }).first()).toBeVisible();
    await expect(panel).toContainText("Legal and Chain of Title");
  });

  test("does not lock a protected vault, and is offered on the lock screen", async ({ page }) => {
    await arrive(page, "preferences");
    await main(page).getByRole("button", { name: "Turn on", exact: true }).last().click();
    await page.fill("#protect-new", PASS);
    await page.fill("#protect-confirm", PASS);
    await page.check("#protect-understood");
    await dialog(page).locator("button[type=submit]").click();
    await expect(page.locator("[data-recovery-code]")).toBeVisible({ timeout: 20_000 });
    await page.check("#recovery-noted");
    await dialog(page).getByRole("button", { name: "Done" }).click();

    await setLanguage(page, "fr");
    await expect(main(page).getByText("Activée", { exact: true })).toBeVisible();
    await expect(page.locator("#unlock-passphrase")).toHaveCount(0);

    // Locked: the switch is there before anything else, and the screen follows it.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Vault verrouillé" })).toBeVisible();
    await setLanguage(page, "en");
    await expect(page.getByRole("heading", { name: "Vault locked" })).toBeVisible();
    expect(await french(page)).toEqual([]);
    await page.getByRole("button", { name: "Forgot your passphrase?" }).click();
    expect(await french(page)).toEqual([]);
    await page.getByRole("button", { name: "Back" }).click();
    await page.fill("#unlock-passphrase", "not the passphrase");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert")).toContainText("Incorrect passphrase.");
    await page.fill("#unlock-passphrase", PASS);
    await page.keyboard.press("Enter");
    await expect(main(page)).toBeVisible({ timeout: 20_000 });
  });

  test("renamed folders keep the name they were given, in both languages", async ({ page }) => {
    await arrive(page, "folder-legal");
    await main(page).getByRole("button", { name: "Folder actions" }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    // The field starts from the name on screen.
    await expect(page.locator("#folder-name")).toHaveValue("Legal and Chain of Title");
    await page.fill("#folder-name", "Contracts and rights");
    await dialog(page).locator("button[type=submit]").click();
    await expect(page.locator("aside").getByText("Contracts and rights").first()).toBeVisible();
    await setLanguage(page, "fr");
    await expect(page.locator("aside").getByText("Contracts and rights").first()).toBeVisible();
    // Its neighbors, still built-in, follow the language.
    await expect(page.locator("aside").getByText("Affaires et finances").first()).toBeVisible();
  });
});

test.describe("built-in names", () => {
  test("stay translatable when a form that shows them in English is saved untouched", async ({ page }) => {
    await arrive(page, "folder-legal");
    // A numbered folder: nothing to save while the name is the one on screen.
    await main(page).getByRole("button", { name: "Folder actions" }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await expect(dialog(page).locator("button[type=submit]")).toBeDisabled();
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(dialog(page)).toHaveCount(0);
    // A sample file: its name, then its details and tags.
    await go(page, "folder-start");
    await page.getByRole("button", { name: /^Actions for Welcome Note/ }).first().click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await expect(page.locator("#file-name")).toHaveValue("Welcome Note");
    await expect(dialog(page).locator("button[type=submit]")).toBeDisabled();
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await page.getByRole("button", { name: /^Actions for Welcome Note/ }).first().click();
    await page.getByRole("menuitem", { name: "Edit details" }).click();
    await dialog(page).locator("button[type=submit]").click();
    await expect(dialog(page)).toHaveCount(0);
    // A project: its period and summary.
    await go(page, "project-pb1");
    await main(page).getByRole("button", { name: "Project actions" }).click();
    await page.getByRole("menuitem", { name: "Edit project" }).click();
    await expect(page.locator("#project-period")).toHaveValue("Production planned for 2029");
    await dialog(page).locator("button[type=submit]").click();
    await expect(dialog(page)).toHaveCount(0);

    await setLanguage(page, "fr");
    await expect(main(page)).toContainText("Production prévue en 2029");
    await expect(main(page)).toContainText("Espace de travail des années FS1 et FS2.");
    await expect(page.locator("aside").getByText("Juridique et chaîne de titres").first()).toBeVisible();
    await go(page, "folder-start");
    await expect(main(page).getByText("Mot de bienvenue").first()).toBeVisible();
    await expect(main(page).getByText("Welcome Note")).toHaveCount(0);
  });
});

test.describe("the journal", () => {
  test("reads in the language of the interface, whichever language the action was done in", async ({ page }) => {
    await openVault(page, "home", { lang: "fr" });
    await upload(page, [textFile("Contract.txt", "x")], "legal");
    await rowMenu(page, "Contract", "Renommer");
    await page.fill("#file-name", "Signed contract");
    await dialog(page).locator("button[type=submit]").click();
    await go(page, "activity");
    await expect(main(page)).toContainText("a téléversé Contract.txt");
    await expect(main(page)).toContainText("a renommé Signed contract.txt");

    await setLanguage(page, "en");
    await expect(main(page)).toContainText("uploaded Contract.txt");
    await expect(main(page)).toContainText("renamed Signed contract.txt");
    // The sample entries too, down to the names of the sample files and departments.
    await expect(main(page)).toContainText(/Finance Office (uploaded|updated|renamed|moved|shared|changed the status of|commented on) /);
    await settled(page);
    expect(await french(page)).toEqual([]);
    // An action done in English reads in French afterwards.
    await go(page, "folder-legal");
    await page.getByRole("button", { name: "Actions for Signed contract.txt" }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    await setLanguage(page, "fr");
    await go(page, "activity");
    await expect(main(page)).toContainText("a archivé Signed contract.txt");
  });
});

test.describe("nothing is left in French when the interface is in English", () => {
  test("and the check that says so does see French when there is some", async ({ page }) => {
    await openVault(page, "home", { lang: "fr" });
    expect((await french(page)).length).toBeGreaterThan(20);
  });

  const VIEWS = ["home", "files", "projects", "project-pb1", "folder-legal", "folder-production", "private", "shared", "favorites", "recent", "archived", "activity", "preferences"];

  test("on every page", async ({ page }) => {
    await arrive(page);
    for (const view of VIEWS) {
      await go(page, view);
      await expect(page).toHaveURL(new RegExp(`#${view}$`));
      await expect(main(page).getByRole("heading", { level: 1 })).toBeVisible();
      expect(await french(page), view).toEqual([]);
    }
    // The tabs of a project, and the deleted files.
    await go(page, "project-pb1");
    for (const tab of await main(page).getByRole("tab").all()) {
      await tab.click();
      expect(await french(page), `project tab ${await tab.innerText()}`).toEqual([]);
    }
    await go(page, "archived");
    await main(page).getByRole("tab").last().click();
    expect(await french(page), "deleted files").toEqual([]);
  });

  test("in the menus, the dialogs and the messages of everyday work", async ({ page }) => {
    await arrive(page, "folder-legal");
    const sweep = async (what: string) => expect(await french(page), what).toEqual([]);

    // Upload, with a refusal.
    await main(page).getByRole("button", { name: "Upload" }).first().click();
    const up = page.getByRole("dialog", { name: "Upload files" });
    await up.locator("#upload-input").setInputFiles([
      { name: "Contract.txt", mimeType: "text/plain", buffer: Buffer.from("The price is 100 dollars.") },
      { name: "virus.exe", mimeType: "application/octet-stream", buffer: Buffer.from([0x4d, 0x5a, 0x90, 0]) },
      { name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from([0x4d, 0x5a, 0x90, 0]) },
      { name: "empty.txt", mimeType: "text/plain", buffer: Buffer.alloc(0) },
    ]);
    await expect(up.getByRole("listitem").filter({ hasText: "virus.exe" })).toContainText("The .exe format is not accepted.");
    await expect(up.getByRole("listitem").filter({ hasText: "fake.pdf" })).toContainText("does not match");
    await sweep("upload dialog");
    await up.locator("button[type=submit]").click();
    await expect(toast(page)).toContainText("1 file uploaded");
    await sweep("after upload");

    // The file's menu, by button and by right click.
    await page.getByRole("button", { name: "Actions for Contract.txt" }).click();
    await sweep("file menu");
    await page.keyboard.press("Escape");
    await row(page, "Contract").click({ button: "right" });
    await sweep("context menu");

    // Each dialog reached from that menu.
    for (const item of ["Rename", "Edit details", "Move", "Share", "Protection", "Version history", "Delete"]) {
      if (!(await page.getByRole("menu").isVisible())) await page.getByRole("button", { name: "Actions for Contract.txt" }).click();
      await page.getByRole("menuitem", { name: item, exact: true }).click();
      await expect(dialog(page)).toBeVisible();
      await sweep(`dialog: ${item}`);
      await page.keyboard.press("Escape");
      await expect(dialog(page)).toHaveCount(0);
    }

    // A second version, and the comparison.
    await page.getByRole("button", { name: "Actions for Contract.txt" }).click();
    await page.getByRole("menuitem", { name: "Version history" }).click();
    await dialog(page).locator("#version-input").setInputFiles(textFile("Contract.txt", "The price is 250 dollars, payable on signature."));
    await expect(dialog(page).getByRole("list", { name: "Versions" }).getByRole("listitem")).toHaveCount(2);
    await sweep("versions");
    await dialog(page).getByRole("button", { name: "Compare" }).click();
    await expect(page.locator("[data-compare]")).toContainText("4 words added");
    await expect(page.locator("[data-compare]")).toContainText("1 word removed");
    await sweep("compare");
    await page.keyboard.press("Escape");

    // Information panel, due date, comment.
    await page.getByRole("button", { name: "Actions for Contract.txt" }).click();
    await page.getByRole("menuitem", { name: "Information" }).click();
    const d = new Date();
    d.setDate(d.getDate() + 12);
    await page.fill("#due-date", `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    await page.fill("#due-label", "Option expires");
    await page.locator("[data-info-panel]").getByRole("button", { name: "Set due date" }).click();
    await expect(page.locator("[data-info-panel] [data-due=soon]")).toHaveText("In 12 days");
    await page.fill("#comment-text", "To renew before the due date.");
    await page.locator("[data-info-panel]").getByRole("button", { name: "Post" }).click();
    await sweep("information panel");
    await page.keyboard.press("Escape");

    // Notifications, search, folders, projects.
    await page.getByRole("button", { name: /^Notifications/ }).click();
    await expect(page.getByRole("menu", { name: "Notifications" })).toContainText("The Vault is not protected");
    await sweep("notifications");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+k");
    await page.getByRole("dialog").getByRole("textbox").fill("price");
    await expect(page.getByRole("dialog").locator("[data-excerpt]")).toBeVisible({ timeout: 20_000 });
    await sweep("search");
    await page.keyboard.press("Escape");
    await main(page).getByRole("button", { name: "New folder" }).click();
    await sweep("new folder");
    await page.keyboard.press("Escape");
    await main(page).getByRole("button", { name: "Folder actions" }).click();
    await sweep("folder menu");
    await page.keyboard.press("Escape");
    await go(page, "projects");
    await main(page).getByRole("button", { name: "New project" }).click();
    await sweep("new project");
  });

  test("in the viewer, for every kind of document", async ({ page }) => {
    await arrive(page, "folder-legal");
    await uploadFiles(
      page,
      [
        await pdfFile("Contract.pdf", 2, "Clause"),
        textFile("Notes.txt", "Plain notes."),
        { name: "Letter.docx", mimeType: "application/octet-stream", buffer: docx(para("A letter.") + `<w:p><w:r><w:br w:type="page"/></w:r></w:p>` + para("Second page.")) },
        { name: "Budget.xlsx", mimeType: "application/octet-stream", buffer: xlsx([{ name: "Summary", rows: [["Item", "Amount", "Paid"], ["Sets", 1200.5, true]] }, { name: "Margins", rows: [["Private"]], hidden: true }]) },
        { name: "Pitch.pptx", mimeType: "application/octet-stream", buffer: pptx([{ title: "Opening" }, { lines: ["No title here"], notes: "Do not announce a date.", hidden: true }]) },
      ],
      "legal",
    );
    const body = dialog(page).locator("[data-viewer-canvas]");
    for (const name of ["Contract", "Notes", "Letter", "Budget", "Pitch"]) {
      await row(page, name).locator("td").nth(1).getByRole("button").first().click();
      await expect(body).toBeVisible();
      await expect(dialog(page).locator("[data-personal-watermark], canvas").first()).toBeAttached();
      await page.waitForTimeout(400);
      expect(await french(page), `viewer: ${name}`).toEqual([]);
      await page.keyboard.press("Escape");
    }
    // What the previews say about themselves, and the watermark line.
    await row(page, "Budget").locator("td").nth(1).getByRole("button").first().click();
    await expect(body).toContainText("TRUE");
    await expect(body).toContainText("1200.5");
    await page.keyboard.press("Escape");
    await row(page, "Notes").locator("td").nth(1).getByRole("button").first().click();
    await expect(body.locator("[data-personal-watermark]").first()).toContainText("Confidential – NDF5");
    await page.keyboard.press("Escape");
    // A sample file, and a document in high protection with its reading band.
    await go(page, "folder-start");
    await main(page).getByRole("button", { name: "Welcome Note" }).first().click();
    await expect(body).toContainText("Sample file");
    expect(await french(page), "sample page").toEqual([]);
    await page.keyboard.press("Escape");
    await go(page, "folder-legal");
    await page.getByRole("button", { name: "Actions for Notes.txt" }).click();
    await page.getByRole("menuitem", { name: "Protection", exact: true }).click();
    await dialog(page).getByRole("radio", { name: /^High protection/ }).check();
    await dialog(page).locator("button[type=submit]").click();
    await row(page, "Notes").locator("td").nth(1).getByRole("button").first().click();
    await expect(dialog(page).locator("[data-fence]")).toBeVisible();
    await page.mouse.move(5, 5);
    expect(await french(page), "protected reading").toEqual([]);
  });

  test("in the settings, their dialogs and the guided tour", async ({ page }) => {
    await openVault(page, "home", { lang: "", tour: true });
    // The tour, step by step.
    const card = page.getByRole("dialog");
    const title = page.locator("#tour-title");
    await expect(title).toHaveText("Welcome to NDF Vault");
    expect(await french(page), "tour welcome").toEqual([]);
    await card.getByRole("button", { name: "Start the tour" }).click();
    for (const step of ["Your views", "The Vault index", "Global search", "Add your documents", "Your files", "Protect the Vault", "Need a reminder?"]) {
      await expect(title).toHaveText(step);
      expect(await french(page), `tour: ${step}`).toEqual([]);
      await card.getByRole("button", { name: step === "Need a reminder?" ? "Done" : "Got it" }).click();
    }
    await expect(card).toBeHidden();

    await go(page, "folder-legal");
    await uploadFiles(page, [textFile("Contract.txt", "x")], "legal");
    await settled(page);
    await go(page, "preferences");
    const sweep = async (what: string) => expect(await french(page), what).toEqual([]);
    for (const [button, what] of [["Back up", "backup"], ["Restore", "restore"], ["Check", "audit"], ["Reset", "reset"]] as const) {
      await main(page).getByRole("button", { name: button, exact: true }).last().click();
      await expect(dialog(page)).toBeVisible();
      if (what === "audit") await expect(dialog(page).locator("[data-audit-report]")).toBeVisible();
      await sweep(`dialog: ${what}`);
      await page.keyboard.press("Escape");
      await expect(dialog(page)).toHaveCount(0);
    }
    // Protection, with the suggested passphrase and the recovery code.
    await main(page).getByRole("button", { name: "Turn on", exact: true }).last().click();
    await dialog(page).getByRole("button", { name: "Suggest a strong passphrase" }).click();
    await sweep("protect dialog");
    await page.fill("#protect-new", "short");
    await sweep("weak passphrase");
    await page.fill("#protect-new", PASS);
    await page.fill("#protect-confirm", PASS);
    await page.check("#protect-understood");
    await dialog(page).locator("button[type=submit]").click();
    await expect(page.locator("[data-recovery-code]")).toBeVisible({ timeout: 20_000 });
    await sweep("recovery code");
    await page.check("#recovery-noted");
    await dialog(page).getByRole("button", { name: "Done" }).click();
    await sweep("settings, protected");
    for (const button of ["Change", "Turn off", "Replace the code", "Export"]) {
      await main(page).getByRole("button", { name: button, exact: true }).last().click();
      await expect(dialog(page)).toBeVisible();
      await sweep(`dialog: ${button}`);
      // Not Escape: three in a row is the emergency lock of a protected vault.
      await dialog(page).getByRole("button", { name: "Cancel" }).click();
      await expect(dialog(page)).toHaveCount(0);
    }
  });
});
