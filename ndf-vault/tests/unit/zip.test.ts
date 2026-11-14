import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildZip, crc32, uniquePaths, zipPath } from "@/lib/zip";

const s = (text: string) => new TextEncoder().encode(text);

describe("crc32", () => {
  it("matches the standard check values", () => {
    expect(crc32(s("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
    expect(crc32(s("The quick brown fox jumps over the lazy dog"))).toBe(0x414fa339);
  });
});

describe("zipPath", () => {
  it("joins cleaned segments", () => {
    expect(zipPath(["06 Juridique et chaîne de titres", "Contrat.pdf"])).toBe("06 Juridique et chaîne de titres/Contrat.pdf");
  });

  it("cannot produce a path that leaves the extraction folder", () => {
    for (const segs of [["..", "..", "etc", "passwd"], ["../../x"], ["/abs", "y"], ["a/../../b"], ["C:\\Windows", "z"], [".", "..", "ok.txt"]]) {
      const p = zipPath(segs);
      expect(p, segs.join("|")).not.toMatch(/(^|\/)\.\.(\/|$)/);
      expect(p.startsWith("/"), segs.join("|")).toBe(false);
      expect(p, segs.join("|")).not.toMatch(/\\|:/);
    }
  });
});

describe("uniquePaths", () => {
  it("numbers duplicates before the extension", () => {
    expect(uniquePaths(["a/x.pdf", "a/x.pdf", "a/X.PDF", "b/x.pdf", "notes", "notes"])).toEqual(["a/x.pdf", "a/x (2).pdf", "a/X (3).PDF", "b/x.pdf", "notes", "notes (2)"]);
  });
});

describe("buildZip", () => {
  const entries = [
    { path: "02 Scénarios/Scénario é.txt", data: s("contenu accentué é à ç") },
    { path: "racine.bin", data: new Blob([new Uint8Array([0, 1, 2, 3, 255])]) },
    { path: "vide.txt", data: new Uint8Array(0) },
  ];

  it("writes a well-formed archive", async () => {
    const zip = new Uint8Array(await (await buildZip(entries, new Date(2026, 10, 14, 15, 4, 30))).arrayBuffer());
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50); // first local header
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50); // end of central directory
    expect(view.getUint16(end + 10, true)).toBe(entries.length);
    const dirOffset = view.getUint32(end + 16, true);
    expect(view.getUint32(dirOffset, true)).toBe(0x02014b50);
    expect(dirOffset + view.getUint32(end + 12, true)).toBe(end);
    // The first entry's recorded checksum and size are those of its content.
    expect(view.getUint32(14, true)).toBe(crc32(entries[0].data as Uint8Array));
    expect(view.getUint32(18, true)).toBe((entries[0].data as Uint8Array).length);
  });

  it("is accepted by a real unzip tool, with names and content intact", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ndf-zip-"));
    const path = join(dir, "test.zip");
    writeFileSync(path, new Uint8Array(await (await buildZip(entries)).arrayBuffer()));
    const script = [
      "import sys, zipfile, json",
      "z = zipfile.ZipFile(sys.argv[1])",
      "bad = z.testzip()",
      "print(json.dumps({'bad': bad, 'names': z.namelist(), 'first': z.read(z.namelist()[0]).decode('utf-8'), 'second': list(z.read('racine.bin'))}))",
    ].join("\n");
    const out = JSON.parse(execFileSync("python3", ["-I", "-c", script, path], { encoding: "utf8" }));
    expect(out.bad).toBeNull();
    expect(out.names).toEqual(entries.map((e) => e.path));
    expect(out.first).toBe("contenu accentué é à ç");
    expect(out.second).toEqual([0, 1, 2, 3, 255]);
    expect(readFileSync(path).length).toBeGreaterThan(100);
  });
});
