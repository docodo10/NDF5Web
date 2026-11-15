import { expect, type Download, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { crc32, deflateSync } from "node:zlib";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { docx, para, pptx, xlsx, type SheetSpec, type SlideSpec } from "../fixtures/office";

export const PASS = "tortue lampe orage fenêtre";

export interface Upload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/* ----------------------------------------------------------------- Fixtures */

/** A real PDF with one line of text per page. */
export async function pdfFile(name: string, pages = 3, label = "Document de test"): Promise<Upload> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) doc.addPage([612, 792]).drawText(`${label} - page ${i + 1}`, { x: 60, y: 700, size: 24, font });
  return { name, mimeType: "application/pdf", buffer: Buffer.from(await doc.save()) };
}

/** A real PNG of one flat color. */
export function pngFile(name: string, width = 320, height = 200, rgb: [number, number, number] = [180, 20, 20]): Upload {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const line = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3).fill(Buffer.from(rgb))]);
  const pixels = Buffer.concat(Array.from({ length: height }, () => line));
  const buffer = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
  return { name, mimeType: "image/png", buffer };
}

export const textFile = (name: string, text: string): Upload => ({ name, mimeType: "text/plain", buffer: Buffer.from(text, "utf8") });

/** The first bytes of a Windows executable. */
export const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff, 0, 0, 0xb8, 0, 0, 0]);

const OFFICE_MIME = "application/vnd.openxmlformats-officedocument";

/** A real Word document. `body` is WordprocessingML; by default, one paragraph. */
export const docxFile = (name: string, body = para("Lettre de test.")): Upload => ({ name, mimeType: `${OFFICE_MIME}.wordprocessingml.document`, buffer: docx(body) });
export const xlsxFile = (name: string, sheets: SheetSpec[]): Upload => ({ name, mimeType: `${OFFICE_MIME}.spreadsheetml.sheet`, buffer: xlsx(sheets) });
export const pptxFile = (name: string, slides: SlideSpec[]): Upload => ({ name, mimeType: `${OFFICE_MIME}.presentationml.presentation`, buffer: pptx(slides) });
/** A ZIP that is not an Office document, whatever it is named. */
export const fakeOffice = (name: string): Upload => ({ name, mimeType: `${OFFICE_MIME}.wordprocessingml.document`, buffer: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("fake office container for tests")]) });

/* --------------------------------------------------------------- Navigation */

/** Open the vault on a view. The first-visit tour is skipped unless `tour` is set. */
export async function openVault(page: Page, hash = "home", options: { tour?: boolean } = {}): Promise<void> {
  if (!options.tour) {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("ndf-vault-tour-done", "1");
      } catch {
        /* storage refused */
      }
    });
  }
  await page.goto(`/preview.html#${hash}`);
  await expect(page.locator("#vault-main")).toBeVisible();
}

/** Go to another view of the already-open vault. */
export async function go(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
}

export const main = (page: Page): Locator => page.locator("#vault-main");
export const sidebar = (page: Page): Locator => page.getByRole("navigation", { name: "Navigation principale" });
export const dialog = (page: Page): Locator => page.getByRole("dialog");
export const toast = (page: Page): Locator => page.locator("[data-toast]");
export const rows = (page: Page): Locator => page.locator("tbody tr");
export const row = (page: Page, name: string): Locator => page.locator("tbody tr", { hasText: name }).first();
export const showing = (page: Page): Locator => page.getByText(/^Affichage de/);

/** Open a file by its name, as a person would. */
export async function openFile(page: Page, name: string): Promise<void> {
  await row(page, name).locator("td").nth(1).getByRole("button").first().click();
}

export async function rowMenu(page: Page, name: string, item: string): Promise<void> {
  await row(page, name).getByRole("button", { name: /^Actions pour/ }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

/* ------------------------------------------------------------------ Actions */

export async function upload(page: Page, files: Upload[], folder?: string): Promise<void> {
  await main(page).getByRole("button", { name: "Téléverser" }).first().click();
  const d = page.getByRole("dialog", { name: "Téléverser des fichiers" });
  await d.locator("#upload-input").setInputFiles(files);
  if (folder) await d.locator("#upload-folder").selectOption(folder);
  const submit = d.locator("button[type=submit]");
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(d).toBeHidden();
}

/** The recovery code on screen, once written down as the dialog asks. */
export async function noteRecoveryCode(page: Page): Promise<string> {
  const shown = page.locator("[data-recovery-code]");
  await expect(shown).toBeVisible({ timeout: 20_000 });
  const code = (await shown.innerText()).trim();
  await page.check("#recovery-noted");
  return code;
}

/** Turn protection on. Resolves the recovery code handed out at the end. */
export async function protect(page: Page, passphrase = PASS): Promise<string> {
  await go(page, "preferences");
  await main(page).getByRole("button", { name: "Activer", exact: true }).last().click();
  await page.fill("#protect-new", passphrase);
  await page.fill("#protect-confirm", passphrase);
  await page.check("#protect-understood");
  await dialog(page).locator("button[type=submit]").click();
  const code = await noteRecoveryCode(page);
  await dialog(page).getByRole("button", { name: "Terminer" }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(main(page).getByText("Activée", { exact: true })).toBeVisible();
  return code;
}

export const lockScreen = (page: Page): Locator => page.getByRole("heading", { name: "Vault verrouillé" });

export async function unlock(page: Page, passphrase = PASS): Promise<void> {
  await page.fill("#unlock-passphrase", passphrase);
  await page.keyboard.press("Enter");
  await expect(page.locator("#vault-main")).toBeVisible({ timeout: 20_000 });
}

/* -------------------------------------------------------------- Inspection */

/** Everything the browser's database holds for the vault, as one string: what a disk reader would see. */
export function diskDump(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const conn = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open("ndf-vault");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    let out = "";
    for (const store of ["state", "blobs"]) {
      const records = await new Promise<unknown[]>((res) => {
        const r = conn.transaction(store).objectStore(store).getAll();
        r.onsuccess = () => res(r.result);
      });
      for (const rec of records) {
        if (rec instanceof Blob) out += await rec.text();
        else if (rec && typeof rec === "object" && "enc" in rec) out += new TextDecoder("latin1").decode(new Uint8Array((rec as { enc: ArrayBuffer }).enc));
        else out += JSON.stringify(rec);
      }
    }
    conn.close();
    return out;
  });
}

/** Overwrite the stored original of the first uploaded file, as someone editing the disk would. */
export function tamperFirstOriginal(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const conn = await new Promise<IDBDatabase>((res) => {
      const r = indexedDB.open("ndf-vault");
      r.onsuccess = () => res(r.result);
    });
    const store = () => conn.transaction("blobs", "readwrite").objectStore("blobs");
    const keys = await new Promise<IDBValidKey[]>((res) => {
      const r = store().getAllKeys();
      r.onsuccess = () => res(r.result);
    });
    const key = keys.find((k) => String(k).startsWith("f-")) ?? keys[0];
    const rec = await new Promise<unknown>((res) => {
      const r = store().get(key);
      r.onsuccess = () => res(r.result);
    });
    let next: unknown;
    if (rec instanceof Blob) next = new Blob(["%PDF-1.7 contenu remplacé par un intrus"], { type: rec.type });
    else {
      const sealed = rec as { enc: ArrayBuffer; type: string };
      const bytes = new Uint8Array(sealed.enc.slice(0));
      bytes[bytes.length - 5] ^= 0xff;
      next = { enc: bytes.buffer, type: sealed.type };
    }
    await new Promise<void>((res) => {
      const tx = conn.transaction("blobs", "readwrite");
      tx.objectStore("blobs").put(next, key);
      tx.oncomplete = () => res();
    });
    conn.close();
    return String(key);
  });
}

export async function downloaded(download: Download): Promise<Buffer> {
  const path = await download.path();
  return readFile(path);
}

/** Names and contents of a ZIP written without compression. */
export function readZip(zip: Buffer): { name: string; data: Buffer }[] {
  const end = zip.length - 22;
  if (zip.readUInt32LE(end) !== 0x06054b50) throw new Error("not a zip written by the vault");
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const out: { name: string; data: Buffer }[] = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error("bad central directory");
    const size = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(dataStart, dataStart + size);
    if (crc32(data) !== zip.readUInt32LE(at + 16)) throw new Error(`checksum mismatch for ${name}`);
    out.push({ name, data });
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  return out;
}
