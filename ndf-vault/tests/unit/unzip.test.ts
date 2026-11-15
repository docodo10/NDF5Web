import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { listZip, readZipEntry, readZipText, ZipError } from "@/lib/unzip";
import { buildZip } from "@/lib/zip";
import { zipBuffer } from "../fixtures/office";

const blob = (b: Buffer) => new Blob([new Uint8Array(b)]);
const problem = async (work: Promise<unknown>) => {
  try {
    await work;
  } catch (e) {
    return e instanceof ZipError ? e.problem : `other: ${String(e)}`;
  }
  return "no error";
};

describe("reading an archive", () => {
  it("lists and reads compressed and stored entries", async () => {
    const zip = blob(zipBuffer([{ name: "a/compressé.txt", data: "é".repeat(5000) }, { name: "b.bin", data: Buffer.from([1, 2, 3]), stored: true }]));
    const items = await listZip(zip);
    expect(items.map((i) => [i.name, i.method, i.size])).toEqual([["a/compressé.txt", 8, 10000], ["b.bin", 0, 3]]);
    expect(items[0].compressedSize).toBeLessThan(200);
    expect(await readZipText(zip, items, "A/Compressé.txt")).toBe("é".repeat(5000));
    expect(Array.from(await readZipEntry(zip, items[1]))).toEqual([1, 2, 3]);
    expect(await readZipText(zip, items, "absent.txt")).toBeNull();
  });

  it("reads back what the vault's own exports write", async () => {
    const zip = await buildZip([{ path: "06 Juridique/Contrat.txt", data: new TextEncoder().encode("contenu") }]);
    const items = await listZip(zip);
    expect(await readZipText(zip, items, "06 Juridique/Contrat.txt")).toBe("contenu");
  });

  it("finds the table of contents behind a trailing comment", async () => {
    const base = zipBuffer([{ name: "x.txt", data: "x" }]);
    const withComment = Buffer.concat([base, Buffer.from("un commentaire en fin d'archive")]);
    withComment.writeUInt16LE(31, base.length - 2);
    expect((await listZip(blob(withComment))).map((i) => i.name)).toEqual(["x.txt"]);
  });
});

describe("refusing what it should not trust", () => {
  it("rejects files that are not archives", async () => {
    expect(await problem(listZip(new Blob(["bonjour"])))).toBe("not-a-zip");
    expect(await problem(listZip(new Blob([new Uint8Array(5000)])))).toBe("not-a-zip");
  });

  it("stops inflating a zip bomb, whatever size its header declares", async () => {
    const bomb = Buffer.alloc(8 * 1024 * 1024); // 8 MB of zeros packs into a few kilobytes
    const zip = zipBuffer([{ name: "bombe.xml", data: bomb }]);
    const items = await listZip(blob(zip));
    expect(items[0].compressedSize).toBeLessThan(20_000);
    // Honest header: refused before any work.
    expect(await problem(readZipEntry(blob(zip), items[0], 1024 * 1024))).toBe("too-large");
    // Lying header: the declared size says 10 bytes, the stream says otherwise.
    expect(await problem(readZipEntry(blob(zip), { ...items[0], size: 10 }, 1024 * 1024))).toBe("too-large");
  });

  it("detects content that does not match its checksum", async () => {
    const zip = zipBuffer([{ name: "a.txt", data: "contenu original", stored: true }]);
    const items = await listZip(blob(zip));
    const at = zip.indexOf("original");
    zip.write("modifiée", at, "latin1");
    expect(await problem(readZipEntry(blob(zip), items[0]))).toBe("damaged");
  });

  it("refuses encrypted entries, unknown compression and truncated archives", async () => {
    const zip = zipBuffer([{ name: "a.txt", data: "abc" }]);
    const [item] = await listZip(blob(zip));
    expect(await problem(readZipEntry(blob(zip), { ...item, encrypted: true }))).toBe("unsupported");
    expect(await problem(readZipEntry(blob(zip), { ...item, method: 12 }))).toBe("unsupported");
    expect(await problem(readZipEntry(blob(zip), { ...item, offset: 999_999 }))).toBe("damaged");
    expect(await problem(readZipEntry(blob(zip), { ...item, compressedSize: 999_999, size: 999_999 }))).toBe("damaged");
    const garbage = zipBuffer([{ name: "a.txt", data: "abc", stored: true }]);
    const [stored] = await listZip(blob(garbage));
    expect(await problem(readZipEntry(new Blob([new Uint8Array(garbage), deflateRawSync(Buffer.from("x"))]), { ...stored, method: 8 }))).toBe("damaged");
  });

  it("refuses an archive that claims an absurd number of entries or a directory outside the file", async () => {
    const zip = zipBuffer([{ name: "a.txt", data: "abc" }]);
    const many = Buffer.from(zip);
    many.writeUInt16LE(60_000, many.length - 22 + 10);
    expect(await problem(listZip(blob(many)))).toBe("too-many-entries");
    const outside = Buffer.from(zip);
    outside.writeUInt32LE(5_000_000, outside.length - 22 + 16);
    expect(await problem(listZip(blob(outside)))).toBe("damaged");
    const zip64 = Buffer.from(zip);
    zip64.writeUInt32LE(0xffffffff, zip64.length - 22 + 16);
    expect(await problem(listZip(blob(zip64)))).toBe("unsupported");
  });
});
