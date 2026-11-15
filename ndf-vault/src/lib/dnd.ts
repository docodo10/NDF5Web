/**
 * Dragging files of the vault onto a folder, as in any file manager.
 * The drag carries the ids of the files; a folder that accepts the drop moves them.
 */

const TYPE = "application/x-ndf-vault-files";

/** Shapes shared by React's and the DOM's drag events. */
interface Transfer {
  dataTransfer: DataTransfer | null;
}

export function startFileDrag(e: Transfer, ids: string[]): void {
  if (!e.dataTransfer || ids.length === 0) return;
  e.dataTransfer.setData(TYPE, JSON.stringify(ids));
  e.dataTransfer.effectAllowed = "move";
}

/** True while what is being dragged is files of the vault (not files from the computer, not text). */
export function isFileDrag(e: Transfer): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes(TYPE);
}

/** The ids carried by a drop; empty when the drop is something else or was tampered with. */
export function droppedFileIds(e: Transfer): string[] {
  try {
    const ids: unknown = JSON.parse(e.dataTransfer?.getData(TYPE) ?? "[]");
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id)).slice(0, 500) : [];
  } catch {
    return [];
  }
}
