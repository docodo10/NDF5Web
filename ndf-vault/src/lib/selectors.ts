import { folderPath } from "./format";
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

export const CATEGORY_LABEL: Record<ProjectCategory, string> = {
  financial: "Financial Documents",
  production: "Production",
  legal: "Legal",
  other: "Other",
};

const FINANCIAL_FOLDERS = new Set(["budgets", "financing", "plans"]);
const PRODUCTION_FOLDERS = new Set(["screenplays", "scheduling", "cast"]);
const LEGAL_FOLDERS = new Set(["legal"]);

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
