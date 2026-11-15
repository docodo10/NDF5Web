import { crc32 } from "./zip";

/**
 * A small, defensive ZIP reader: enough to look inside Office files.
 *
 * The archive comes from outside, so nothing in it is trusted: the number of
 * entries is capped, an entry is never inflated past a fixed size whatever its
 * header claims (a "zip bomb" declares a few bytes and expands to gigabytes),
 * and what comes out is checked against its checksum.
 */

export interface ZipItem {
  name: string;
  /** 0 stored, 8 deflate. Anything else cannot be read here. */
  method: number;
  compressedSize: number;
  /** Size once inflated, as the archive declares it. */
  size: number;
  crc: number;
  /** Where the entry's local header starts. */
  offset: number;
  encrypted: boolean;
}

export type ZipProblem = "not-a-zip" | "too-many-entries" | "too-large" | "unsupported" | "damaged";

export class ZipError extends Error {
  constructor(public readonly problem: ZipProblem) {
    super(problem);
    this.name = "ZipError";
  }
}

export const MAX_ZIP_ENTRIES = 5000;
/** The most one entry may inflate to. */
export const MAX_ENTRY_BYTES = 24 * 1024 * 1024;
/** The most the table of contents itself may weigh. */
const MAX_DIRECTORY_BYTES = 16 * 1024 * 1024;

const END_SIGNATURE = 0x06054b50;
const DIR_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

const decoder = new TextDecoder();

/** The archive's table of contents. Reads only the end of the file, never the entries themselves. */
export async function listZip(file: Blob): Promise<ZipItem[]> {
  if (file.size < 22) throw new ZipError("not-a-zip");
  // The end record is the last thing in the file, followed at most by a 64 KB comment.
  const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 65_557)).arrayBuffer());
  const tv = new DataView(tail.buffer);
  let end = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tv.getUint32(i, true) === END_SIGNATURE) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ZipError("not-a-zip");
  const count = tv.getUint16(end + 10, true);
  const dirSize = tv.getUint32(end + 12, true);
  const dirOffset = tv.getUint32(end + 16, true);
  // 0xFFFF and 0xFFFFFFFF mean "see the ZIP64 record": archives beyond 4 GB or 65,535 entries.
  if (count === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) throw new ZipError("unsupported");
  if (count > MAX_ZIP_ENTRIES) throw new ZipError("too-many-entries");
  if (dirOffset + dirSize > file.size) throw new ZipError("damaged");
  if (dirSize > MAX_DIRECTORY_BYTES) throw new ZipError("too-many-entries");

  const dir = new Uint8Array(await file.slice(dirOffset, dirOffset + dirSize).arrayBuffer());
  const dv = new DataView(dir.buffer);
  const items: ZipItem[] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > dir.length || dv.getUint32(at, true) !== DIR_SIGNATURE) throw new ZipError("damaged");
    const flags = dv.getUint16(at + 8, true);
    const nameLength = dv.getUint16(at + 28, true);
    const next = at + 46 + nameLength + dv.getUint16(at + 30, true) + dv.getUint16(at + 32, true);
    if (next > dir.length) throw new ZipError("damaged");
    items.push({
      name: decoder.decode(dir.subarray(at + 46, at + 46 + nameLength)),
      method: dv.getUint16(at + 10, true),
      crc: dv.getUint32(at + 16, true),
      compressedSize: dv.getUint32(at + 20, true),
      size: dv.getUint32(at + 24, true),
      offset: dv.getUint32(at + 42, true),
      encrypted: (flags & 1) === 1,
    });
    at = next;
  }
  return items;
}

/** Inflate a raw deflate stream, giving up as soon as it grows past `limit`. */
async function inflate(data: Blob, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const reader = data.stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) throw new ZipError("too-large");
      chunks.push(value);
    }
  } catch (e) {
    void reader.cancel().catch(() => {});
    throw e instanceof ZipError ? e : new ZipError("damaged");
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** The content of one entry. Throws ZipError when it is too large, encrypted, damaged or packed in a way this reader does not know. */
export async function readZipEntry(file: Blob, item: ZipItem, limit = MAX_ENTRY_BYTES): Promise<Uint8Array<ArrayBuffer>> {
  if (item.encrypted || (item.method !== 0 && item.method !== 8)) throw new ZipError("unsupported");
  if (item.size > limit || (item.method === 0 && item.compressedSize > limit)) throw new ZipError("too-large");
  if (item.offset + 30 > file.size) throw new ZipError("damaged");
  const head = new DataView(await file.slice(item.offset, item.offset + 30).arrayBuffer());
  if (head.getUint32(0, true) !== LOCAL_SIGNATURE) throw new ZipError("damaged");
  const start = item.offset + 30 + head.getUint16(26, true) + head.getUint16(28, true);
  if (start + item.compressedSize > file.size) throw new ZipError("damaged");
  const packed = file.slice(start, start + item.compressedSize);
  const bytes = item.method === 0 ? new Uint8Array(await packed.arrayBuffer()) : await inflate(packed, limit);
  if (crc32(bytes) !== item.crc) throw new ZipError("damaged");
  return bytes;
}

/** Read an entry as UTF-8 text, or null when the archive has no such entry. Names are matched without regard to case. */
export async function readZipText(file: Blob, items: ZipItem[], name: string, limit = MAX_ENTRY_BYTES): Promise<string | null> {
  const wanted = name.toLowerCase();
  const item = items.find((i) => i.name.toLowerCase() === wanted);
  if (!item) return null;
  return decoder.decode(await readZipEntry(file, item, limit));
}
