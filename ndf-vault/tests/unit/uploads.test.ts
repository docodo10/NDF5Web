import { describe, expect, it } from "vitest";
import { checkUpload, contentMatches, detectContent, inspectUpload, MAX_UPLOAD_BYTES } from "@/lib/uploads";
import { docx, para, pptx, xlsx, zipBuffer } from "../fixtures/office";

const b = (...v: number[]) => new Uint8Array(v);
const s = (text: string) => new TextEncoder().encode(text);
const file = (name: string, content: Uint8Array | string, type = "") => new File([content as BlobPart], name, { type });

const PDF = s("%PDF-1.7\n%âãÏÓ\n1 0 obj\n");
const PNG = b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const JPG = b(0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46);
const ZIP = b(0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0);
const EXE = b(0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0);
const ELF = b(0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0);
const WEBP = b(...s("RIFF"), 1, 2, 3, 4, ...s("WEBP"), ...s("VP8 "));

describe("content detection", () => {
  it("recognizes each accepted format by its first bytes", () => {
    expect(detectContent(PDF)).toBe("pdf");
    expect(detectContent(PNG)).toBe("png");
    expect(detectContent(JPG)).toBe("jpg");
    expect(detectContent(s("GIF89a...."))).toBe("gif");
    expect(detectContent(WEBP)).toBe("webp");
    expect(detectContent(ZIP)).toBe("zip");
    expect(detectContent(s("Bonjour,\nceci est du texte é à ç."))).toBe("text");
  });

  it("recognizes executables and other binary content", () => {
    expect(detectContent(EXE)).toBe("executable");
    expect(detectContent(ELF)).toBe("executable");
    expect(detectContent(b(1, 2, 0, 4))).toBe("binary");
  });

  it("accepts a PDF header after a little leading junk, but not far into the file", () => {
    expect(detectContent(s("\n\n  %PDF-1.4"))).toBe("pdf");
    expect(detectContent(s("x".repeat(2000) + "%PDF-1.4"))).toBe("text");
  });

  it("treats UTF-16 text as text", () => {
    expect(detectContent(b(0xff, 0xfe, 0x42, 0, 0x6f, 0))).toBe("text");
  });
});

describe("extension against content", () => {
  it("accepts matching pairs", () => {
    expect(contentMatches("pdf", PDF)).toBe(true);
    expect(contentMatches("jpeg", JPG)).toBe(true);
    expect(contentMatches("docx", ZIP)).toBe(true);
    expect(contentMatches("csv", s("a,b\n1,2\n"))).toBe(true);
  });

  it("refuses a file whose content is not what its extension says", () => {
    expect(contentMatches("pdf", EXE)).toBe(false); // executable renamed to .pdf
    expect(contentMatches("png", JPG)).toBe(false);
    expect(contentMatches("txt", EXE)).toBe(false);
    expect(contentMatches("txt", PDF)).toBe(false);
    expect(contentMatches("docx", PDF)).toBe(false);
    expect(contentMatches("pdf", s("<html><script>alert(1)</script>"))).toBe(false);
  });

  it("refuses extensions it does not know", () => {
    expect(contentMatches("exe", EXE)).toBe(false);
    expect(contentMatches("svg", s("<svg onload=alert(1)>"))).toBe(false);
    expect(contentMatches("html", s("<html>"))).toBe(false);
  });
});

describe("checkUpload", () => {
  it("accepts a known extension, whatever its case", () => {
    const c = checkUpload(file("Contrat.PDF", PDF));
    expect(c).toMatchObject({ name: "Contrat", ext: "pdf", kind: "pdf", error: null });
  });

  it("refuses unknown, missing and dangerous extensions", () => {
    expect(checkUpload(file("virus.exe", EXE)).error).toMatch(/\.exe/);
    expect(checkUpload(file("page.html", "<html>")).error).toMatch(/\.html/);
    expect(checkUpload(file("image.svg", "<svg>")).error).toMatch(/\.svg/);
    expect(checkUpload(file("sans-extension", "x")).error).toMatch(/extension/);
    // The last extension is the one that counts.
    expect(checkUpload(file("facture.pdf.exe", EXE)).error).toMatch(/\.exe/);
  });

  it("refuses empty and oversized files", () => {
    expect(checkUpload(file("vide.pdf", "")).error).toMatch(/vide/);
    const big = { name: "gros.pdf", size: MAX_UPLOAD_BYTES + 1 } as File;
    expect(checkUpload(big).error).toMatch(/100 Mo/);
  });

  it("cleans the name it will store", () => {
    expect(checkUpload(file("../../etc/passwd.txt", "x")).name).toBe("-..-etc-passwd");
    expect(checkUpload(file("rapport\u202Efdp.txt", "x")).name).toBe("rapportfdp");
    expect(checkUpload(file("a\u0000b\tc.txt", "x")).name).toBe("ab c");
    expect(checkUpload(file("   .pdf", PDF)).name).toBe("Sans titre");
  });
});

describe("inspectUpload", () => {
  it("accepts a real file and gives its fingerprint", async () => {
    const c = await inspectUpload(file("Contrat.pdf", PDF));
    expect(c.error).toBeNull();
    expect(c.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses an executable renamed with an accepted extension", async () => {
    for (const name of ["facture.pdf", "photo.png", "notes.txt", "budget.csv", "lettre.docx"]) {
      const c = await inspectUpload(file(name, EXE));
      expect(c.error, name).toMatch(/ne correspond pas/);
      expect(c.sha256).toBeUndefined();
    }
  });

  it("refuses HTML dressed up as a PDF or an image", async () => {
    expect((await inspectUpload(file("page.pdf", "<html><script>alert(1)</script></html>"))).error).toMatch(/ne correspond pas/);
    expect((await inspectUpload(file("page.png", "<svg onload=alert(1)>"))).error).toMatch(/ne correspond pas/);
  });

  it("accepts real Office documents", async () => {
    expect((await inspectUpload(file("Lettre.docx", new Uint8Array(docx(para("Bonjour")))))).error).toBeNull();
    expect((await inspectUpload(file("Budget.xlsx", new Uint8Array(xlsx([{ name: "A", rows: [[1]] }]))))).error).toBeNull();
    expect((await inspectUpload(file("Pitch.pptx", new Uint8Array(pptx([{ title: "Titre" }]))))).error).toBeNull();
  });

  it("refuses a ZIP that is not the Office document its name claims", async () => {
    const archive = new Uint8Array(zipBuffer([{ name: "n'importe quoi.txt", data: "x" }]));
    expect((await inspectUpload(file("archive.docx", archive))).error).toBe("Ce fichier n’est pas un document Word valide.");
    expect((await inspectUpload(file("feuille.xlsx", new Uint8Array(docx(para("x")))))).error).toBe("Ce fichier n’est pas un classeur Excel valide.");
    expect((await inspectUpload(file("diapos.pptx", archive))).error).toBe("Ce fichier n’est pas une présentation PowerPoint valide.");
  });

  it("refuses Office documents that carry macros", async () => {
    const macro = new Uint8Array(docx(para("x"), [{ name: "word/vbaProject.bin", data: "macro" }]));
    const c = await inspectUpload(file("Facture.docx", macro));
    expect(c.error).toMatch(/macros/);
    expect(c.sha256).toBeUndefined();
  });

  it("points out a file the vault already holds", async () => {
    const first = await inspectUpload(file("Contrat.pdf", PDF));
    const again = await inspectUpload(file("Copie du contrat.pdf", PDF), [{ sha256: first.sha256, label: "Contrat.pdf" }]);
    expect(again.error).toBeNull();
    expect(again.duplicateOf).toBe("Contrat.pdf");
    const other = await inspectUpload(file("Autre.pdf", s("%PDF-1.7 different")), [{ sha256: first.sha256, label: "Contrat.pdf" }]);
    expect(other.duplicateOf).toBeUndefined();
  });
});
