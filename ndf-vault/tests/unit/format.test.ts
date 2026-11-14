import { describe, expect, it } from "vitest";
import { count, formatDate, formatSize, formatTime, MAX_NAME_LEN, sanitizeName } from "@/lib/format";

describe("sanitizeName", () => {
  it("leaves an ordinary name alone, accents included", () => {
    expect(sanitizeName("Scénario FS1 Film Part 1")).toBe("Scénario FS1 Film Part 1");
    expect(sanitizeName("Budget PB1 – Page sommaire")).toBe("Budget PB1 – Page sommaire");
  });

  it("cannot be used to climb out of a folder", () => {
    for (const evil of ["../../etc/passwd", "..\\..\\windows\\system32", "/absolute/path", "....//....//x", "./.hidden"]) {
      const clean = sanitizeName(evil);
      expect(clean, evil).not.toMatch(/[\\/]/);
      expect(clean, evil).not.toMatch(/^\./);
    }
  });

  it("removes control characters and text-direction overrides", () => {
    expect(sanitizeName("a\u0000b\u0007c")).toBe("abc");
    expect(sanitizeName("ligne1\r\nligne2")).toBe("ligne1 ligne2");
    // U+202E makes "exe.pdf" read as "fdp.exe" in a file list.
    expect(sanitizeName("facture\u202Efdp.exe")).toBe("facturefdp.exe");
    expect(sanitizeName("\u200e\u200fnom\u2066\u2069\ufeff")).toBe("nom");
  });

  it("drops characters a file system refuses", () => {
    expect(sanitizeName('a<b>c"d|e?f*g')).toBe("abcdefg");
    expect(sanitizeName("Budget : version 2")).toBe("Budget - version 2");
  });

  it("collapses whitespace and trims", () => {
    expect(sanitizeName("   beaucoup    d’espaces   ")).toBe("beaucoup d’espaces");
    expect(sanitizeName("\t\n ")).toBe("");
  });

  it("caps the length", () => {
    expect(sanitizeName("x".repeat(5000)).length).toBe(MAX_NAME_LEN);
  });

  it("keeps markup as inert text", () => {
    // Nothing here is dangerous once React escapes it; it must simply survive as plain characters.
    expect(sanitizeName("<img src=x onerror=alert(1)>")).toBe("img src=x onerror=alert(1)");
  });
});

describe("French formats", () => {
  it("formats dates", () => {
    expect(formatDate("2026-11-13T09:00:00")).toBe("13 nov. 2026");
    expect(formatDate("2026-03-01T09:00:00")).toBe("1er mars 2026");
  });

  it("formats times on 24 hours", () => {
    expect(formatTime("2026-11-13T15:04:00")).toBe("15 h 04");
    expect(formatTime("2026-11-13T00:30:00")).toBe("0 h 30");
  });

  it("formats sizes with French units", () => {
    expect(formatSize(512)).toBe("512 o");
    expect(formatSize(2048)).toBe("2 Ko");
    expect(formatSize(2.2 * 1024 * 1024)).toBe("2,2 Mo");
    expect(formatSize(84 * 1024 * 1024)).toBe("84 Mo");
    expect(formatSize(1.5 * 1024 ** 3)).toBe("1,5 Go");
  });

  it("agrees nouns with their count", () => {
    expect(count(0, "fichier")).toBe("0 fichier");
    expect(count(1, "fichier")).toBe("1 fichier");
    expect(count(3, "fichier")).toBe("3 fichiers");
    expect(count(2, "journal", "journaux")).toBe("2 journaux");
  });
});
