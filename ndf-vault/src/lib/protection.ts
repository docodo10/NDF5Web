/**
 * Protection levels for documents, and what they rest on.
 *
 * None of this depends on the code being secret: the code is public, and
 * reading it gives nothing without the key. What a level adds is friction and
 * traceability for someone who is allowed to look but not to take: no
 * download, no copy, a watermark that is part of the picture, a code that
 * names the consultation, and a view that never shows the whole page at once.
 *
 * It does not make a document impossible to copy. Whatever a screen shows, a
 * camera can photograph. The aim is that a copy costs effort, shows little at
 * a time, and names the person who made it.
 */

export type Protection = "standard" | "view" | "high";

export const PROTECTION_LEVELS: Protection[] = ["standard", "view", "high"];

export const PROTECTION_LABEL: Record<Protection, string> = { standard: "Standard", view: "Consultation seule", high: "Haute protection" };

export const PROTECTION_HINT: Record<Protection, string> = {
  standard: "Le document s’ouvre, se télécharge et s’exporte normalement.",
  view: "Téléchargement et export bloqués. Pas de copie ni de clic droit, filigrane personnel incrusté dans l’image, code de consultation au journal.",
  high: "Consultation seule, plus la lecture protégée : seule une bande du document est nette à la fois, et tout se masque dès que la fenêtre n’est plus active.",
};

const RANK: Record<Protection, number> = { standard: 0, view: 1, high: 2 };

export function protectionOf(file: { protection?: "view" | "high" } | undefined): Protection {
  return file?.protection ?? "standard";
}

/** True when going from one level to the other takes protection away. */
export function lowers(from: Protection, to: Protection): boolean {
  return RANK[to] < RANK[from];
}

/** The highest level among several files. */
export function highest(levels: Protection[]): Protection {
  return levels.reduce<Protection>((top, l) => (RANK[l] > RANK[top] ? l : top), "standard");
}

const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * A short code that names one consultation of one document. It is printed in
 * the watermark and written to the journal: a photo that shows the watermark
 * says which opening it was taken from.
 */
export function consultationCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[bytes[i] & 31];
  return `${out.slice(0, 3)}-${out.slice(3)}`;
}

/** What someone types back from a photo, brought to the code's form; null when it cannot be one. */
export function normalizeConsultationCode(input: string): string | null {
  const s = input
    .toUpperCase()
    .replace(/[\s\-_.·]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (s.length !== 6) return null;
  for (const c of s) if (!CODE_ALPHABET.includes(c)) return null;
  return `${s.slice(0, 3)}-${s.slice(3)}`;
}

/** The minimal drawing surface the watermark needs: a canvas context, or a stand-in in tests. */
export interface Brush {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  fillText(text: string, x: number, y: number): void;
  globalAlpha: number;
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
}

/**
 * Draw the watermark into the pixels of a page. Unlike an element laid over
 * the page, it cannot be removed by deleting something from the document
 * tree: it is part of the image.
 */
export function bakeWatermark(ctx: Brush, width: number, height: number, text: string): void {
  const size = Math.max(9, Math.round(width * 0.0165));
  const reach = Math.hypot(width, height);
  const step = Math.max(size * 5, reach / 9);
  const line = `${text}      ·      ${text}`;
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = "#0a0a0a";
  ctx.font = `600 ${size}px Geist, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.translate(width / 2, height / 2);
  ctx.rotate((-28 * Math.PI) / 180);
  for (let y = -reach / 2, i = 0; y <= reach / 2; y += step, i++) ctx.fillText(line, (i % 2 ? 1 : -1) * width * 0.06, y);
  ctx.restore();
}
