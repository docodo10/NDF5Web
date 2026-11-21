import { formatDate, formatTime } from "./format";
import { t } from "./i18n";
import type { Profile } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

/** The personal watermark line: who is looking, and when. */
export function watermarkText(profile: Profile, at = new Date()): string {
  const iso = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}:00`;
  return [profile.name, profile.company, profile.email, `${formatDate(iso)}, ${formatTime(iso)}`, t("Confidentiel – NDF5", "Confidential – NDF5")]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ");
}

/** The standard PDF fonts only cover Windows-1252; anything else becomes "?". */
export function winAnsiSafe(text: string): string {
  return text.replace(/[^\x20-\x7e -ÿ–—‘’“”•…€]/g, "?");
}

/**
 * Write the watermark across every page of a PDF. Throws when the document
 * cannot be opened (password-protected or damaged).
 */
export async function stampPdf(blob: Blob, text: string): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
  const doc = await PDFDocument.load(await blob.arrayBuffer(), { updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const line = winAnsiSafe(text);
  const angle = 32;
  const rad = (angle * Math.PI) / 180;
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.max(7, Math.min(width, height) / 40);
    const length = font.widthOfTextAtSize(line, size);
    for (const k of [0.2, 0.5, 0.8]) {
      page.drawText(line, {
        x: width / 2 - (Math.cos(rad) * length) / 2,
        y: height * k - (Math.sin(rad) * length) / 2,
        size,
        font,
        color: rgb(0.35, 0.35, 0.35),
        opacity: 0.22,
        rotate: degrees(angle),
      });
    }
    page.drawText(line, { x: 18, y: 10, size: 6.5, font, color: rgb(0.35, 0.35, 0.35), opacity: 0.75 });
  }
  const bytes = await doc.save();
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
}

const IMAGE_TYPE: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/png" };
const TYPE_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Draw the watermark over an image. The result may change format (an animated GIF becomes a PNG). */
export async function stampImage(blob: Blob, text: string, ext: string): Promise<{ blob: Blob; ext: string }> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const size = Math.max(11, Math.round(Math.min(canvas.width, canvas.height) / 34));
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const k of [0.2, 0.5, 0.8]) {
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height * k);
    ctx.rotate((-28 * Math.PI) / 180);
    // A light halo under a dark line stays legible on bright and dark pictures alike.
    ctx.lineWidth = Math.max(2, size / 6);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = "rgba(20,20,20,0.42)";
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  const wanted = IMAGE_TYPE[ext] ?? "image/png";
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, wanted, 0.92));
  if (!out) throw new Error("image export failed");
  return { blob: out, ext: TYPE_EXT[out.type] ?? "png" };
}
