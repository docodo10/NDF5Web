import { count, descendantIds, folderPath } from "./format";
import { localized, t } from "./i18n";
import type { Folder, Project, VaultFile } from "./types";

/** Files that are neither deleted nor archived: what every regular view lists. */
export function activeFiles(files: VaultFile[]): VaultFile[] {
  return files.filter((f) => !f.deleted && !f.archived);
}

export function byModifiedDesc(a: VaultFile, b: VaultFile): number {
  return b.modifiedAt.localeCompare(a.modifiedAt);
}

export function byCreatedDesc(a: VaultFile, b: VaultFile): number {
  return b.createdAt.localeCompare(a.createdAt);
}

export type ProjectCategory = "financial" | "production" | "legal" | "other";

export const CATEGORY_LABEL: Record<ProjectCategory, string> = localized({
  financial: ["Documents financiers", "Financial documents"],
  production: ["Production", "Production"],
  legal: ["Juridique", "Legal"],
  other: ["Autres", "Other"],
});

const FINANCIAL_FOLDERS = new Set(["business"]);
const PRODUCTION_FOLDERS = new Set(["screenplays", "story", "production", "talent"]);
const LEGAL_FOLDERS = new Set(["legal", "to-sign", "signed"]);

/**
 * A file's category inside a project workspace, derived from where it is filed:
 * the top-level folder it sits under, or a project (PB / FS) folder.
 */
export function fileCategory(file: VaultFile, folders: Folder[], projects: Project[]): ProjectCategory {
  const path = folderPath(folders, file.folderId);
  const top = path.find((f) => f.parentId !== null);
  if (!top) return "other";
  if (FINANCIAL_FOLDERS.has(top.id)) return "financial";
  if (LEGAL_FOLDERS.has(top.id)) return "legal";
  if (PRODUCTION_FOLDERS.has(top.id)) return "production";
  if (projects.some((p) => p.folderId === top.id)) return "production";
  return "other";
}

export interface FolderRules {
  renamable: boolean;
  /** Why the folder cannot be moved, in French; null when it can. */
  moveBlocked: string | null;
  /** Why the folder cannot be deleted, in French; null when it can. */
  deleteBlocked: string | null;
}

/** What may be done to a folder. The root and the numbered index are structural and stay in place. */
export function folderRules(folder: Folder, folders: Folder[], files: VaultFile[], projects: Project[]): FolderRules {
  if (folder.parentId === null) {
    const why = t("La racine du Vault ne peut pas être modifiée.", "The root of the Vault cannot be changed.");
    return { renamable: false, moveBlocked: why, deleteBlocked: why };
  }
  if (folder.index) {
    return { renamable: true, moveBlocked: t("Les dossiers numérotés de l’index restent à leur place.", "The numbered folders of the index stay where they are."), deleteBlocked: t("Les dossiers numérotés de l’index ne peuvent pas être supprimés.", "The numbered folders of the index cannot be deleted.") };
  }
  const project = projects.find((p) => p.folderId === folder.id);
  if (project) return { renamable: true, moveBlocked: null, deleteBlocked: t(`Ce dossier est celui du projet ${project.code}. Archivez le projet à la place.`, `This folder belongs to project ${project.code}. Archive the project instead.`) };
  const inside = descendantIds(folders, folder.id);
  const subfolders = inside.size - 1;
  // Archived and deleted files still live in their folder, so they count too.
  const held = files.filter((f) => inside.has(f.folderId)).length;
  if (subfolders > 0 || held > 0) {
    // i18n-ok: the French half of the sentence below.
    const parts = [held > 0 ? count(held, "fichier") : "", subfolders > 0 ? count(subfolders, "sous-dossier") : ""].filter(Boolean).join(" et ");
    const partsEn = [held > 0 ? count(held, "file") : "", subfolders > 0 ? count(subfolders, "subfolder") : ""].filter(Boolean).join(" and ");
    return { renamable: true, moveBlocked: null, deleteBlocked: t(`Ce dossier contient ${parts} (fichiers archivés et supprimés compris). Videz-le d’abord.`, `This folder contains ${partsEn} (archived and deleted files included). Empty it first.`) };
  }
  return { renamable: true, moveBlocked: null, deleteBlocked: null };
}
