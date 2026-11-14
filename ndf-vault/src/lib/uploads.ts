import { EXT_KIND } from "./sample-data";
import type { FileKind } from "./types";

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export const ACCEPTED_EXTENSIONS = Object.keys(EXT_KIND);

/** Value for <input type="file" accept>. */
export const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(",");

export interface UploadCheck {
  file: File;
  name: string;
  ext: string;
  kind: FileKind | null;
  /** Why the file is refused, in French; null when it can be uploaded. */
  error: string | null;
}

export function checkUpload(file: File): UploadCheck {
  const dot = file.name.lastIndexOf(".");
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : "";
  const name = (dot > 0 ? file.name.slice(0, dot) : file.name).trim() || "Sans titre";
  const kind = EXT_KIND[ext] ?? null;
  let error: string | null = null;
  if (!kind) error = ext ? `Le format .${ext} n’est pas accepté.` : "Ce fichier n’a pas d’extension.";
  else if (file.size === 0) error = "Ce fichier est vide.";
  else if (file.size > MAX_UPLOAD_BYTES) error = "Ce fichier dépasse la limite de 200 Mo.";
  return { file, name, ext, kind, error };
}

/**
 * Hand a file to the viewer. A hosted page cannot start a download by itself,
 * so the host's own save prompt is used when there is one; otherwise a normal
 * browser download.
 */
export async function saveToDisk(filename: string, blob: Blob): Promise<"saved" | "declined" | "failed"> {
  type Downloads = { save: (r: { filename: string; data: Blob }) => Promise<unknown> };
  const host = (window as unknown as { claude?: { use: (name: string) => Promise<Downloads | null> } }).claude;
  if (host?.use) {
    try {
      const downloads = await host.use("downloads");
      if (downloads) {
        await downloads.save({ filename, data: blob });
        return "saved";
      }
    } catch (e) {
      return (e as { code?: string })?.code === "declined" ? "declined" : "failed";
    }
    return "failed";
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return "saved";
  } catch {
    return "failed";
  }
}
