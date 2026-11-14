export type FileKind = "pdf" | "docx" | "xlsx" | "pptx" | "txt" | "csv" | "image";

export type FileStatus = "Draft" | "In Review" | "Approved" | "Final" | "Archived";

export const STATUSES: FileStatus[] = ["Draft", "In Review", "Approved", "Final", "Archived"];

export interface VaultFile {
  id: string;
  name: string;
  ext: string;
  kind: FileKind;
  size: number; // bytes
  folderId: string;
  projectId: string | null;
  ownerId: string;
  createdAt: string; // ISO
  modifiedAt: string; // ISO
  status: FileStatus;
  tags: string[];
  notes: string;
  favorite: boolean;
  pinned: boolean;
  visibility: "private" | "team";
  sharedWithMe: boolean;
  archived: boolean;
  deleted: boolean;
  pages: number;
  /** True for built-in sample entries that have no stored file behind them. */
  sample: boolean;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  code?: string;
  /** Position in the numbered vault index ("00" to "10"). */
  index?: string;
  /** Who is meant to see this folder. A label only: nothing enforces it until guest access exists. */
  access?: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  period: string;
  summary: string;
  storyYears: string[];
  folderId: string;
  archived: boolean;
}

export interface User {
  id: string;
  name: string;
  role: string;
  initials: string;
}

export interface ActivityItem {
  id: string;
  at: string; // ISO
  userId: string;
  verb: string;
  target: string;
  projectId: string | null;
}

export type Route =
  | { view: "home" }
  | { view: "files" }
  | { view: "projects" }
  | { view: "private" }
  | { view: "shared" }
  | { view: "favorites" }
  | { view: "recent" }
  | { view: "archived" }
  | { view: "activity" }
  | { view: "preferences" }
  | { view: "project"; id: string }
  | { view: "folder"; id: string };
