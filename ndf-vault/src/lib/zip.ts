import { sanitizeName } from "./format";

/**
 * A minimal ZIP writer (no compression): enough to hand several originals to
 * the user as one file. Office files, PDFs and images are already compressed,
 * so storing them as-is costs almost nothing.
 */

export interface ZipEntry {
  /** Path inside the archive, with "/" between folders. */
  path: string;
  data: Blob | Uint8Array<ArrayBuffer>;
}

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * A safe path for an archive entry: every segment is cleaned, and nothing can
 * climb out of the folder the archive is extracted into ("zip slip").
 */
export function zipPath(segments: string[]): string {
  return segments
    .map((s) => sanitizeName(s).replace(/\.+$/, ""))
    .filter((s) => s && s !== "." && s !== "..")
    .join("/");
}

/** Give each entry a path no other entry has: "name (2).pdf", "name (3).pdf"… */
export function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  return paths.map((p) => {
    let candidate = p;
    const dot = p.lastIndexOf(".");
    const slash = p.lastIndexOf("/");
    const [stem, ext] = dot > slash + 1 ? [p.slice(0, dot), p.slice(dot)] : [p, ""];
    for (let n = 2; seen.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${ext}`;
    seen.add(candidate.toLowerCase());
    return candidate;
  });
}

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export async function buildZip(entries: ZipEntry[], now = new Date()): Promise<Blob> {
  if (entries.length > 65_535) throw new Error("too many files for one archive");
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(now);
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const bytes = entry.data instanceof Blob ? new Uint8Array(await entry.data.arrayBuffer()) : entry.data;
    const crc = crc32(bytes);
    if (offset + bytes.length > 0xfffffff0) throw new Error("archive larger than 4 GB");

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // names are UTF-8
    lv.setUint16(8, 0, true); // stored, no compression
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, bytes.length, true);
    lv.setUint32(22, bytes.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    const dir = new Uint8Array(46 + name.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true); // version made by
    dv.setUint16(6, 20, true); // version needed
    dv.setUint16(8, 0x0800, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, time, true);
    dv.setUint16(14, date, true);
    dv.setUint32(16, crc, true);
    dv.setUint32(20, bytes.length, true);
    dv.setUint32(24, bytes.length, true);
    dv.setUint16(28, name.length, true);
    dv.setUint32(42, offset, true); // where the local header starts
    dir.set(name, 46);

    parts.push(local, bytes);
    central.push(dir);
    offset += local.length + bytes.length;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...parts, ...central, end], { type: "application/zip" });
}
